// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The part of the Atlas MultiFeed used here. Prices have 18 decimals.
interface IAtlasFeed {
    function fetch(bytes4 feedId)
        external
        view
        returns (uint256 price, uint256 aggregatedTimestamp, uint256 onchainTimestamp);
}
