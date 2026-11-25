// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {TestRWA} from "../src/TestRWA.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {MandateParams, Reason, RiskInput} from "../src/Types.sol";

/// @dev Shared setup: one mandate, SG, $100 per trade, $200 per 7 days, tGOLD only, $300 deposited.
abstract contract Base is Test {
    uint64 constant NOW = 1_795_618_800; // Wed 25 Nov 2026 15:00 UTC, market open
    uint256 constant GOLD_PRICE = 4000e18;
    uint256 constant EQUITY_PRICE = 140e18;

    TestUSD usd;
    TestRWA gold;
    TestRWA equity;
    RiskOracle oracle;
    ComplianceRegistry compliance;
    MandateRegistry registry;
    MarketCalendar calendar;
    PolicyGuard guard;

    address admin = makeAddr("admin");
    address attester = makeAddr("attester");
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address venue = makeAddr("venue");
    uint256 id;

    function setUp() public virtual {
        vm.warp(NOW);
        usd = new TestUSD("Mandrail Test USD", "tUSD");
        gold = new TestRWA("Mandrail Test Tokenized Gold", "tGOLD", admin);
        equity = new TestRWA("Mandrail Test Tokenized Equity", "tEQUITY", admin);
        oracle = new RiskOracle(admin, attester);
        compliance = new ComplianceRegistry(admin);
        registry = new MandateRegistry(address(0));
        calendar = new MarketCalendar(admin);
        guard = new PolicyGuard(usd, registry, compliance, oracle, calendar);

        vm.startPrank(admin);
        compliance.setVenueApproved(venue, true);
        compliance.setAssetRestriction(address(equity), "US", true);
        oracle.setRequiresSecondSource(address(equity), true);
        calendar.setHasCalendar(address(equity), true);
        vm.stopPrank();

        _push(address(gold), GOLD_PRICE, 100, 0, 0);
        _push(address(equity), EQUITY_PRICE, 100, EQUITY_PRICE, uint64(block.timestamp));

        id = _createMandate(owner);
        _deposit(id, owner, 300e18);
    }

    function _params() internal view returns (MandateParams memory p) {
        p.agent = agent;
        p.jurisdiction = "SG";
        p.maxPerTradeUsd = 100e18;
        p.maxPerPeriodUsd = 200e18;
        p.periodSeconds = 7 days;
        p.maxRiskAgeSeconds = 900;
        p.allowedAssets = new address[](1);
        p.allowedAssets[0] = address(gold);
    }

    function _createMandate(address who) internal returns (uint256) {
        MandateParams memory p = _params();
        vm.prank(who);
        return registry.createMandate(p);
    }

    function _deposit(uint256 mandateId, address who, uint256 amount) internal {
        deal(address(usd), who, usd.balanceOf(who) + amount);
        vm.startPrank(who);
        usd.approve(address(guard), amount);
        guard.deposit(mandateId, amount);
        vm.stopPrank();
    }

    function _push(address asset, uint256 price, int256 change1h, uint256 atlasPrice, uint64 atlasTs) internal {
        RiskInput memory i;
        i.priceUsd = price;
        i.change1hPpm = change1h;
        i.sourceTimestamp = uint64(block.timestamp);
        i.atlasPriceUsd = atlasPrice;
        i.atlasTimestamp = atlasTs;
        vm.prank(attester);
        oracle.update(asset, i);
    }

    function _allowEquity() internal {
        vm.prank(owner);
        registry.setAllowedAsset(id, address(equity), true);
    }

    function _assertReason(Reason actual, Reason expected) internal pure {
        assertEq(uint8(actual), uint8(expected), "reason");
    }
}
