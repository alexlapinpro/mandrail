// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {RogueVenue} from "../src/RogueVenue.sol";
import {RWAMarket} from "../src/RWAMarket.sol";
import {TestRWA} from "../src/TestRWA.sol";
import {TestUSD} from "../src/TestUSD.sol";

/// @notice Deploys everything, wires roles and demo rules, writes addresses to deployments/.
contract Deploy is Script {
    string constant BRAND = "Mandrail";
    /// @dev Official ERC-8004 identity registry on BSC testnet.
    address constant ERC8004_BSC_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    uint32 constant THANKSGIVING_2026 = 1_795_651_200 / 86_400; // Thu 26 Nov
    uint32 constant DAY_AFTER_2026 = THANKSGIVING_2026 + 1;
    uint32 constant EARLY_CLOSE = 18 hours; // 13:00 in New York

    struct Deployed {
        TestUSD usd;
        TestRWA gold;
        TestRWA equity;
        RiskOracle oracle;
        ComplianceRegistry compliance;
        MandateRegistry registry;
        MarketCalendar calendar;
        PolicyGuard guard;
        RWAMarket market;
        RogueVenue rogue;
    }

    function run() external {
        address attester = vm.addr(vm.envUint("ATTESTER_PRIVATE_KEY"));
        address identity = block.chainid == 97 ? ERC8004_BSC_TESTNET : address(0);
        uint256 deployBlock = block.number;
        Deployed memory d = deployAll(vm.envUint("DEPLOYER_PRIVATE_KEY"), attester, identity);
        _write(d, identity, deployBlock);
    }

    function deployAll(uint256 deployerKey, address attester, address identity) public returns (Deployed memory d) {
        address admin = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        d.usd = new TestUSD(string.concat(BRAND, " Test USD"), "tUSD");
        d.gold = new TestRWA(string.concat(BRAND, " Test Tokenized Gold"), "tGOLD", admin);
        d.equity = new TestRWA(string.concat(BRAND, " Test Tokenized Equity"), "tEQUITY", admin);
        d.oracle = new RiskOracle(admin, attester);
        d.compliance = new ComplianceRegistry(admin);
        d.registry = new MandateRegistry(identity);
        d.calendar = new MarketCalendar(admin);
        d.guard = new PolicyGuard(d.usd, d.registry, d.compliance, d.oracle, d.calendar);
        d.market = new RWAMarket(admin, d.usd, d.oracle);
        d.rogue = new RogueVenue(d.usd);

        d.gold.grantRole(d.gold.MINTER_ROLE(), address(d.market));
        d.equity.grantRole(d.equity.MINTER_ROLE(), address(d.market));
        d.market.setSupported(address(d.gold), true);
        d.market.setSupported(address(d.equity), true);
        d.compliance.setVenueApproved(address(d.market), true);
        d.compliance.setAssetRestriction(address(d.equity), "US", true);
        d.oracle.setRequiresSecondSource(address(d.equity), true);
        d.calendar.setHasCalendar(address(d.equity), true);
        d.calendar.setHoliday(THANKSGIVING_2026, true);
        d.calendar.setEarlyClose(DAY_AFTER_2026, EARLY_CLOSE);

        vm.stopBroadcast();
    }

    function _write(Deployed memory d, address identity, uint256 deployBlock) private {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", deployBlock);
        vm.serializeAddress(k, "usd", address(d.usd));
        vm.serializeAddress(k, "tGOLD", address(d.gold));
        vm.serializeAddress(k, "tEQUITY", address(d.equity));
        vm.serializeAddress(k, "riskOracle", address(d.oracle));
        vm.serializeAddress(k, "compliance", address(d.compliance));
        vm.serializeAddress(k, "mandateRegistry", address(d.registry));
        vm.serializeAddress(k, "marketCalendar", address(d.calendar));
        vm.serializeAddress(k, "policyGuard", address(d.guard));
        vm.serializeAddress(k, "market", address(d.market));
        vm.serializeAddress(k, "rogueVenue", address(d.rogue));
        vm.serializeAddress(k, "identityRegistry", identity);
        string memory json = vm.serializeUint(k, "challengeMandateId", 0);
        string memory path = deploymentPath();
        vm.writeJson(json, path);
        console.log("Addresses written to", path);
    }

    function deploymentPath() public view returns (string memory) {
        return block.chainid == 97 ? "deployments/bsc-testnet.json" : "deployments/local.json";
    }
}
