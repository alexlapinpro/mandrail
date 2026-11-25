// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Test USD
/// @notice Test asset for hackathon demo. Not a real security or product token.
contract TestUSD is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1000e18;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice When an address may use the faucet again.
    mapping(address account => uint256) public faucetAvailableAt;

    error FaucetCooldown(uint256 availableAt);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Mints 1,000 test USD to the caller, once per hour.
    function faucet() external {
        uint256 availableAt = faucetAvailableAt[msg.sender];
        if (block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        faucetAvailableAt[msg.sender] = block.timestamp + FAUCET_COOLDOWN;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
