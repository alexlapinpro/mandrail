// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {ComplianceRegistry} from "./ComplianceRegistry.sol";
import {MandateRegistry} from "./MandateRegistry.sol";
import {MarketCalendar} from "./MarketCalendar.sol";
import {RiskOracle} from "./RiskOracle.sol";
import {Mandate, Reason, RiskData} from "./Types.sol";

/// @title Policy guard
/// @notice Holds each mandate's budget and is the only path through which an agent can trade.
contract PolicyGuard is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 private constant SOURCE_CMC = 0;
    uint8 private constant SOURCE_ATLAS = 1;

    IERC20 public immutable usd;
    MandateRegistry public immutable registry;
    ComplianceRegistry public immutable compliance;
    RiskOracle public immutable oracle;
    MarketCalendar public immutable calendar;

    /// @notice Unspent test USD per mandate.
    mapping(uint256 mandateId => uint256) public balanceOf;
    /// @notice Start of the current spending window, 0 before the first trade.
    mapping(uint256 mandateId => uint256) public periodStart;

    mapping(uint256 mandateId => uint256) private _spent;

    event Deposited(uint256 indexed mandateId, uint256 amount);

    error ZeroAmount();
    error NotOwner();

    constructor(
        IERC20 usd_,
        MandateRegistry registry_,
        ComplianceRegistry compliance_,
        RiskOracle oracle_,
        MarketCalendar calendar_
    ) {
        usd = usd_;
        registry = registry_;
        compliance = compliance_;
        oracle = oracle_;
        calendar = calendar_;
    }

    /// @notice The owner adds budget to a mandate.
    function deposit(uint256 mandateId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (registry.getMandate(mandateId).owner != msg.sender) revert NotOwner();
        balanceOf[mandateId] += amount;
        usd.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(mandateId, amount);
    }

    /// @notice Amount spent in the current window. An elapsed window counts as empty.
    function spentInPeriod(uint256 mandateId) external view returns (uint256) {
        return _currentSpent(mandateId, registry.getMandate(mandateId).periodSeconds);
    }

    /// @notice Pre-flight: would this trade be allowed, and if not, why?
    /// @return reason First failed check, or OK.
    /// @return context ABI-encoded numbers behind the decision, see docs/ARCHITECTURE.md.
    function checkTrade(uint256 mandateId, address caller, address asset, address venue, uint256 usdAmount)
        public
        view
        returns (Reason reason, bytes memory context)
    {
        if (usdAmount == 0) revert ZeroAmount();
        Mandate memory m = registry.getMandate(mandateId);

        (reason, context) = _checkAuthority(m, mandateId, caller, asset, venue);
        if (reason != Reason.OK) return (reason, context);

        (reason, context) = _checkLimits(m, mandateId, usdAmount);
        if (reason != Reason.OK) return (reason, context);

        (reason, context) = _checkRisk(m, asset);
        if (reason != Reason.OK) return (reason, context);

        uint256 balance = balanceOf[mandateId];
        if (usdAmount > balance) return (Reason.INSUFFICIENT_BALANCE, abi.encode(usdAmount, balance));

        if (m.requireMarketOpen && !calendar.isOpen(asset, uint64(block.timestamp))) {
            return (Reason.UNDERLYING_MARKET_CLOSED, abi.encode(asset, uint64(block.timestamp)));
        }
    }

    function _checkAuthority(Mandate memory m, uint256 mandateId, address caller, address asset, address venue)
        private
        view
        returns (Reason, bytes memory)
    {
        if (caller != m.agent) return (Reason.NOT_AGENT, abi.encode(caller, m.agent));
        if (!m.active) return (Reason.MANDATE_INACTIVE, "");
        if (m.expiresAt != 0 && block.timestamp >= m.expiresAt) {
            return (Reason.MANDATE_EXPIRED, abi.encode(m.expiresAt, uint64(block.timestamp)));
        }
        if (!registry.isAssetAllowed(mandateId, asset)) return (Reason.ASSET_NOT_ALLOWED, abi.encode(asset));
        if (compliance.isRestricted(asset, m.jurisdiction)) {
            return (Reason.JURISDICTION_RESTRICTED, abi.encode(asset, m.jurisdiction));
        }
        (bool approved, bool denied) = compliance.venueStatus(venue);
        if (!approved || denied) return (Reason.VENUE_DENIED, abi.encode(venue, approved, denied));
        return (Reason.OK, "");
    }

    function _checkLimits(Mandate memory m, uint256 mandateId, uint256 usdAmount)
        private
        view
        returns (Reason, bytes memory)
    {
        if (usdAmount > m.maxPerTradeUsd) {
            return (Reason.EXCEEDS_PER_TRADE, abi.encode(usdAmount, m.maxPerTradeUsd));
        }
        // Compared without adding, so a huge request is blocked and recorded instead of overflowing.
        uint256 spent = _currentSpent(mandateId, m.periodSeconds);
        uint256 left = spent >= m.maxPerPeriodUsd ? 0 : m.maxPerPeriodUsd - spent;
        if (usdAmount > left) return (Reason.EXCEEDS_PERIOD, abi.encode(usdAmount, spent, m.maxPerPeriodUsd));
        return (Reason.OK, "");
    }

    function _checkRisk(Mandate memory m, address asset) private view returns (Reason, bytes memory) {
        RiskData memory d = oracle.getRisk(asset);
        uint64 nowTs = uint64(block.timestamp);

        if (_isOld(d.sourceTimestamp, m.maxRiskAgeSeconds)) {
            return (Reason.RISK_DATA_STALE, abi.encode(SOURCE_CMC, d.sourceTimestamp, nowTs, m.maxRiskAgeSeconds));
        }

        if (m.maxDivergencePpm != 0 && oracle.requiresSecondSource(asset)) {
            uint64 maxAtlasAge = oracle.maxAtlasAge();
            if (_isOld(d.atlasTimestamp, maxAtlasAge)) {
                return (Reason.RISK_DATA_STALE, abi.encode(SOURCE_ATLAS, d.atlasTimestamp, nowTs, maxAtlasAge));
            }
            uint256 gap = d.priceUsd > d.atlasPriceUsd ? d.priceUsd - d.atlasPriceUsd : d.atlasPriceUsd - d.priceUsd;
            uint256 gapPpm = Math.mulDiv(gap, 1e6, d.atlasPriceUsd);
            if (gapPpm > m.maxDivergencePpm) {
                return
                    (Reason.PRICE_DIVERGENCE, abi.encode(d.priceUsd, d.atlasPriceUsd, gapPpm, m.maxDivergencePpm));
            }
        }

        if (m.maxVolatilityPpm != 0 && SignedMath.abs(d.change1hPpm) > m.maxVolatilityPpm) {
            return (Reason.VOLATILITY_BREAKER, abi.encode(d.change1hPpm, m.maxVolatilityPpm));
        }
        return (Reason.OK, "");
    }

    /// @dev A missing timestamp is old; one ahead of the block has age 0.
    function _isOld(uint64 timestamp, uint64 maxAge) private view returns (bool) {
        return timestamp == 0 || (block.timestamp > timestamp && block.timestamp - timestamp > maxAge);
    }

    function _currentSpent(uint256 mandateId, uint64 periodSeconds) private view returns (uint256) {
        return block.timestamp >= periodStart[mandateId] + periodSeconds ? 0 : _spent[mandateId];
    }
}
