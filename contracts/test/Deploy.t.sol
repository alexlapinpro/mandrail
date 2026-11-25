// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {SetupChallenge} from "../script/SetupChallenge.s.sol";
import {Mandate, MandateParams, Reason, RiskInput} from "../src/Types.sol";

contract DeployTest is Test {
    uint256 constant DEPLOYER_KEY = 0xA11CE;
    uint64 constant NOW = 1_795_618_800; // Wed 25 Nov 2026 15:00 UTC
    address deployer = vm.addr(DEPLOYER_KEY);
    address attester = makeAddr("attester");
    address agent = makeAddr("agent");
    address identity = makeAddr("identity");
    Deploy.Deployed d;

    function setUp() public {
        vm.warp(NOW);
        d = new Deploy().deployAll(DEPLOYER_KEY, attester, identity);
    }

    function test_names() public view {
        assertEq(d.usd.name(), "Mandrail Test USD");
        assertEq(d.gold.name(), "Mandrail Test Tokenized Gold");
        assertEq(d.equity.name(), "Mandrail Test Tokenized Equity");
        assertEq(d.usd.symbol(), "tUSD");
        assertEq(d.gold.symbol(), "tGOLD");
        assertEq(d.equity.symbol(), "tEQUITY");
    }

    function test_roles() public view {
        assertTrue(d.oracle.hasRole(d.oracle.ATTESTER_ROLE(), attester));
        assertFalse(d.oracle.hasRole(d.oracle.ATTESTER_ROLE(), deployer));
        assertTrue(d.gold.hasRole(d.gold.MINTER_ROLE(), address(d.market)));
        assertTrue(d.equity.hasRole(d.equity.MINTER_ROLE(), address(d.market)));
        assertFalse(d.gold.hasRole(d.gold.MINTER_ROLE(), deployer));
        bytes32 adminRole = 0x00;
        assertTrue(d.oracle.hasRole(adminRole, deployer));
        assertTrue(d.compliance.hasRole(adminRole, deployer));
        assertTrue(d.calendar.hasRole(adminRole, deployer));
        assertTrue(d.gold.hasRole(adminRole, deployer));
        assertTrue(d.equity.hasRole(adminRole, deployer));
        assertEq(d.market.owner(), deployer);
    }

    function test_compliance() public view {
        (bool approved, bool denied) = d.compliance.venueStatus(address(d.market));
        assertTrue(approved);
        assertFalse(denied);
        (approved,) = d.compliance.venueStatus(address(d.rogue));
        assertFalse(approved);
        assertTrue(d.compliance.isRestricted(address(d.equity), "US"));
        assertFalse(d.compliance.isRestricted(address(d.equity), "SG"));
        assertFalse(d.compliance.isRestricted(address(d.gold), "US"));
    }

    function test_marketAndOracle() public view {
        assertTrue(d.market.isSupported(address(d.gold)));
        assertTrue(d.market.isSupported(address(d.equity)));
        assertTrue(d.oracle.requiresSecondSource(address(d.equity)));
        assertFalse(d.oracle.requiresSecondSource(address(d.gold)));
        assertEq(address(d.registry.identityRegistry()), identity);
    }

    function test_calendar() public view {
        uint64 wed = NOW;
        assertTrue(d.calendar.isOpen(address(d.equity), wed));
        assertFalse(d.calendar.isOpen(address(d.equity), wed + 1 days)); // Thanksgiving
        assertTrue(d.calendar.isOpen(address(d.equity), wed + 2 days));
        assertFalse(d.calendar.isOpen(address(d.equity), wed + 2 days + 3 hours)); // closes 18:00 UTC
        assertTrue(d.calendar.isOpen(address(d.gold), wed + 1 days));
    }

    function test_wiring_fullBuy() public {
        _push(address(d.gold), 4000e18);
        MandateParams memory p;
        p.agent = agent;
        p.jurisdiction = "SG";
        p.maxPerTradeUsd = 100e18;
        p.maxPerPeriodUsd = 200e18;
        p.periodSeconds = 7 days;
        p.maxRiskAgeSeconds = 900;
        p.allowedAssets = new address[](1);
        p.allowedAssets[0] = address(d.gold);

        uint256 id = d.registry.createMandate(p);
        d.usd.faucet();
        d.usd.approve(address(d.guard), 300e18);
        d.guard.deposit(id, 300e18);
        vm.prank(agent);
        (bool ok,) = d.guard.executeTrade(id, address(d.gold), address(d.market), 50e18, 0);
        assertTrue(ok);
        assertEq(d.gold.balanceOf(address(this)), 50e18 * 1e18 / 4000e18);
    }

    function test_challengeMandate() public {
        uint256 id = new SetupChallenge().setup(DEPLOYER_KEY, agent, d.usd, d.registry, d.guard, address(d.gold));
        Mandate memory m = d.registry.getMandate(id);
        assertEq(m.owner, deployer);
        assertEq(m.agent, agent);
        assertEq(m.jurisdiction, bytes2("SG"));
        assertEq(m.maxPerTradeUsd, 5e18);
        assertEq(m.maxPerPeriodUsd, 50e18);
        assertEq(m.periodSeconds, 1 days);
        assertEq(m.maxRiskAgeSeconds, 900);
        assertEq(m.maxVolatilityPpm, 0);
        assertEq(m.maxDivergencePpm, 0);
        assertEq(m.expiresAt, 0);
        assertTrue(d.registry.isAssetAllowed(id, address(d.gold)));
        assertFalse(d.registry.isAssetAllowed(id, address(d.equity)));
        assertEq(d.guard.balanceOf(id), 200e18);

        _push(address(d.gold), 4000e18);
        vm.startPrank(agent);
        (bool ok, Reason reason) = d.guard.executeTrade(id, address(d.gold), address(d.rogue), 5e18, 0);
        assertFalse(ok);
        assertEq(uint8(reason), uint8(Reason.VENUE_DENIED));
        (ok,) = d.guard.executeTrade(id, address(d.gold), address(d.market), 5e18, 0);
        assertTrue(ok);
    }

    function _push(address asset, uint256 price) internal {
        RiskInput memory i;
        i.priceUsd = price;
        i.sourceTimestamp = uint64(block.timestamp);
        vm.prank(attester);
        d.oracle.update(asset, i);
    }
}
