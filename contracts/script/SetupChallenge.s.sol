// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {MandateParams} from "../src/Types.sol";

/// @notice Creates and funds the mandate behind the public "Break my agent" page.
contract SetupChallenge is Script {
    uint256 constant DEPOSIT = 200e18;

    function run() external {
        string memory path = block.chainid == 97 ? "deployments/bsc-testnet.json" : "deployments/local.json";
        string memory json = vm.readFile(path);
        uint256 id = setup(
            vm.envUint("DEPLOYER_PRIVATE_KEY"),
            vm.addr(vm.envUint("CHALLENGE_AGENT_PRIVATE_KEY")),
            TestUSD(vm.parseJsonAddress(json, ".usd")),
            MandateRegistry(vm.parseJsonAddress(json, ".mandateRegistry")),
            PolicyGuard(vm.parseJsonAddress(json, ".policyGuard")),
            vm.parseJsonAddress(json, ".tGOLD")
        );
        vm.writeJson(vm.toString(id), path, ".challengeMandateId");
        console.log("Challenge mandate", id);
    }

    function setup(
        uint256 ownerKey,
        address agent,
        TestUSD usd,
        MandateRegistry registry,
        PolicyGuard guard,
        address gold
    ) public returns (uint256 id) {
        MandateParams memory p;
        p.agent = agent;
        p.jurisdiction = "SG";
        p.maxPerTradeUsd = 5e18;
        p.maxPerPeriodUsd = 50e18;
        p.periodSeconds = 1 days;
        p.maxRiskAgeSeconds = 900;
        p.allowedAssets = new address[](1);
        p.allowedAssets[0] = gold;

        vm.startBroadcast(ownerKey);
        usd.faucet();
        usd.approve(address(guard), DEPOSIT);
        id = registry.createMandate(p);
        guard.deposit(id, DEPOSIT);
        vm.stopBroadcast();
    }
}
