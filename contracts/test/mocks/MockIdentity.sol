// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "../../src/interfaces/IIdentityRegistry.sol";

contract MockIdentity is IIdentityRegistry {
    mapping(uint256 => address) public getAgentWallet;

    function set(uint256 id, address wallet) external {
        getAgentWallet[id] = wallet;
    }
}
