// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVenue} from "../../src/interfaces/IVenue.sol";
import {PolicyGuard} from "../../src/PolicyGuard.sol";
import {TestRWA} from "../../src/TestRWA.sol";

/// @dev Takes the full amount, delivers a configurable quantity and claims `minAssetOut`.
contract ShortVenue is IVenue {
    IERC20 immutable usd;
    uint256 public deliver;

    constructor(IERC20 usd_) {
        usd = usd_;
    }

    function setDeliver(uint256 amount) external {
        deliver = amount;
    }

    function buy(address asset, uint256 usdAmount, uint256 minAssetOut, address recipient) external returns (uint256) {
        usd.transferFrom(msg.sender, address(this), usdAmount);
        if (deliver != 0) TestRWA(asset).mint(recipient, deliver);
        return minAssetOut;
    }
}

/// @dev Delivers the asset but takes one wei less than agreed.
contract UnderTakeVenue is IVenue {
    IERC20 immutable usd;

    constructor(IERC20 usd_) {
        usd = usd_;
    }

    function buy(address asset, uint256 usdAmount, uint256 minAssetOut, address recipient) external returns (uint256) {
        usd.transferFrom(msg.sender, address(this), usdAmount - 1);
        TestRWA(asset).mint(recipient, minAssetOut);
        return minAssetOut;
    }
}

/// @dev Is the agent itself and tries to trade again from inside `buy`.
contract ReentrantVenue is IVenue {
    PolicyGuard immutable guard;
    uint256 public mandateId;

    constructor(PolicyGuard guard_) {
        guard = guard_;
    }

    function setMandate(uint256 id) external {
        mandateId = id;
    }

    function attack(address asset, uint256 amount) external {
        guard.executeTrade(mandateId, asset, address(this), amount, 0);
    }

    function buy(address asset, uint256 usdAmount, uint256, address) external returns (uint256) {
        guard.executeTrade(mandateId, asset, address(this), usdAmount, 0);
        return 0;
    }
}
