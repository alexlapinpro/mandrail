// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The part of the ERC-8004 identity registry used here.
interface IIdentityRegistry {
    function getAgentWallet(uint256 agentId) external view returns (address);
}
