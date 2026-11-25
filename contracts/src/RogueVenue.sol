// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVenue} from "./interfaces/IVenue.sol";

/// @title Rogue venue (demo attacker)
/// @notice Takes the money and delivers nothing. Never approved; it shows that the guard stops theft.
contract RogueVenue is IVenue {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;

    constructor(IERC20 usd_) {
        usd = usd_;
    }

    function buy(address, uint256 usdAmount, uint256 minAssetOut, address) external returns (uint256) {
        usd.safeTransferFrom(msg.sender, address(this), usdAmount);
        return minAssetOut; // a lie
    }
}
