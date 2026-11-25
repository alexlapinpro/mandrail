// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAtlasFeed} from "./interfaces/IAtlasFeed.sol";
import {Reason} from "./Types.sol";

/// @title Atlas risk check
/// @notice Compares a reference price with the live Atlas feed on BSC mainnet. Reads only: no funds, no owner.
/// @dev Applies the same staleness and divergence rules as PolicyGuard, without a relayer in between.
contract AtlasRiskCheck {
    IAtlasFeed public immutable atlas;

    constructor(IAtlasFeed atlas_) {
        atlas = atlas_;
    }

    /// @param maxDivergencePpm 1% = 10,000. 0 switches the divergence rule off.
    /// @return reason OK, RISK_DATA_STALE or PRICE_DIVERGENCE.
    function check(bytes4 feedId, uint256 referencePrice, uint32 maxDivergencePpm, uint64 maxAge)
        external
        view
        returns (Reason reason, uint256 atlasPrice, uint64 atlasTimestamp, uint256 gapPpm)
    {
        uint256 timestamp;
        (atlasPrice,, timestamp) = atlas.fetch(feedId);
        atlasTimestamp = uint64(timestamp);
        if (atlasPrice != 0) {
            uint256 gap = referencePrice > atlasPrice ? referencePrice - atlasPrice : atlasPrice - referencePrice;
            gapPpm = Math.mulDiv(gap, 1e6, atlasPrice);
        }

        bool old = block.timestamp > timestamp && block.timestamp - timestamp > maxAge;
        if (atlasPrice == 0 || timestamp == 0 || old) {
            reason = Reason.RISK_DATA_STALE;
        } else if (maxDivergencePpm != 0 && gapPpm > maxDivergencePpm) {
            reason = Reason.PRICE_DIVERGENCE;
        }
    }
}
