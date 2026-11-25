// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {RiskData, RiskInput} from "./Types.sol";

/// @title Risk oracle
/// @notice Latest CoinMarketCap and Atlas data per asset, pushed by a trusted attester.
/// @dev Hackathon simplification: one attester relays both sources. Production reads Atlas feeds
/// directly on the same chain, or uses a quorum of attesters.
contract RiskOracle is AccessControl {
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");
    uint64 public constant MAX_FUTURE_DRIFT = 5 minutes;

    /// @notice Oldest Atlas price the divergence breaker accepts, in seconds.
    uint64 public maxAtlasAge = 1 hours;
    /// @notice Assets whose CMC price must be confirmed by Atlas when a mandate asks for it.
    mapping(address asset => bool) public requiresSecondSource;

    mapping(address asset => RiskData) private _risk;

    event RiskUpdated(
        address indexed asset,
        uint256 priceUsd,
        int256 change1hPpm,
        int256 change24hPpm,
        uint64 sourceTimestamp,
        uint256 atlasPriceUsd,
        uint64 atlasTimestamp
    );
    event MaxAtlasAgeSet(uint64 maxAge);
    event RequiresSecondSourceSet(address indexed asset, bool required);

    error ZeroPrice();
    error SourceTooOld();
    error SourceInFuture();
    error LengthMismatch();

    constructor(address admin, address attester) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTER_ROLE, attester);
    }

    function update(address asset, RiskInput calldata input) external onlyRole(ATTESTER_ROLE) {
        _update(asset, input);
    }

    function updateBatch(address[] calldata assets, RiskInput[] calldata inputs) external onlyRole(ATTESTER_ROLE) {
        if (assets.length != inputs.length) revert LengthMismatch();
        for (uint256 i; i < assets.length; ++i) {
            // One late quote must not stop the other assets; the stored newer one stays.
            if (inputs[i].sourceTimestamp < _risk[assets[i]].sourceTimestamp) continue;
            _update(assets[i], inputs[i]);
        }
    }

    function setMaxAtlasAge(uint64 maxAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxAtlasAge = maxAge;
        emit MaxAtlasAgeSet(maxAge);
    }

    function setRequiresSecondSource(address asset, bool required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        requiresSecondSource[asset] = required;
        emit RequiresSecondSourceSet(asset, required);
    }

    function getRisk(address asset) external view returns (RiskData memory) {
        return _risk[asset];
    }

    function _update(address asset, RiskInput calldata input) private {
        RiskData storage d = _risk[asset];
        uint256 limit = block.timestamp + MAX_FUTURE_DRIFT;
        if (input.priceUsd == 0) revert ZeroPrice();
        if (input.sourceTimestamp < d.sourceTimestamp) revert SourceTooOld();
        if (input.sourceTimestamp > limit || input.atlasTimestamp > limit) revert SourceInFuture();

        d.priceUsd = input.priceUsd;
        d.change1hPpm = input.change1hPpm;
        d.change24hPpm = input.change24hPpm;
        d.updatedAt = uint64(block.timestamp);
        d.sourceTimestamp = input.sourceTimestamp;
        // A failed or lagging Atlas read must not block the CMC update or wipe a newer price.
        if (input.atlasPriceUsd != 0 && input.atlasTimestamp >= d.atlasTimestamp) {
            d.atlasPriceUsd = input.atlasPriceUsd;
            d.atlasTimestamp = input.atlasTimestamp;
        }

        emit RiskUpdated(
            asset, d.priceUsd, d.change1hPpm, d.change24hPpm, d.sourceTimestamp, d.atlasPriceUsd, d.atlasTimestamp
        );
    }
}
