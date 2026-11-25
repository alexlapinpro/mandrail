// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A place where the guard can buy an asset with test USD.
interface IVenue {
    /// @dev Pulls exactly `usdAmount` from the caller and delivers the asset to `recipient`.
    function buy(address asset, uint256 usdAmount, uint256 minAssetOut, address recipient)
        external
        returns (uint256 assetOut);
}
