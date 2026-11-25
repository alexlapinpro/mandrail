// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVenue} from "./interfaces/IVenue.sol";
import {RiskOracle} from "./RiskOracle.sol";
import {TestRWA} from "./TestRWA.sol";

/// @title Demo market
/// @notice Sells test assets for test USD at the oracle price. A stand-in for a real venue.
contract RWAMarket is IVenue, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;
    RiskOracle public immutable oracle;
    mapping(address asset => bool) public isSupported;

    event AssetSupportSet(address indexed asset, bool supported);

    error UnsupportedAsset(address asset);
    error NoPrice(address asset);
    error Slippage(uint256 assetOut, uint256 minAssetOut);

    constructor(address owner_, IERC20 usd_, RiskOracle oracle_) Ownable(owner_) {
        usd = usd_;
        oracle = oracle_;
    }

    function setSupported(address asset, bool supported) external onlyOwner {
        isSupported[asset] = supported;
        emit AssetSupportSet(asset, supported);
    }

    function buy(address asset, uint256 usdAmount, uint256 minAssetOut, address recipient)
        external
        returns (uint256 assetOut)
    {
        if (!isSupported[asset]) revert UnsupportedAsset(asset);
        uint256 price = oracle.getRisk(asset).priceUsd;
        if (price == 0) revert NoPrice(asset);
        assetOut = usdAmount * 1e18 / price;
        if (assetOut < minAssetOut) revert Slippage(assetOut, minAssetOut);
        usd.safeTransferFrom(msg.sender, address(this), usdAmount);
        TestRWA(asset).mint(recipient, assetOut);
    }
}
