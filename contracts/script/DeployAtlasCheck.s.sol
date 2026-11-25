// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AtlasRiskCheck} from "../src/AtlasRiskCheck.sol";
import {IAtlasFeed} from "../src/interfaces/IAtlasFeed.sol";

/// @notice Deploys the read-only Atlas check to BSC mainnet. Costs real BNB: run it only on purpose.
contract DeployAtlasCheck is Script {
    address constant ATLAS_MULTIFEED = 0xEAcE519ebB14fB8404fA6DdD23C3b34abaDE44aa;

    function run() external {
        require(block.chainid == 56, "BSC mainnet only");
        AtlasRiskCheck checker = deploy(vm.envUint("MAINNET_DEPLOYER_PRIVATE_KEY"));
        console.log("AtlasRiskCheck", address(checker));
    }

    function deploy(uint256 key) public returns (AtlasRiskCheck checker) {
        vm.startBroadcast(key);
        checker = new AtlasRiskCheck(IAtlasFeed(ATLAS_MULTIFEED));
        vm.stopBroadcast();
    }
}
