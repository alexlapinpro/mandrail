// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {Mandate, MandateParams} from "../src/Types.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

contract MandateRegistryTest is Test {
    MandateRegistry registry;
    MandateRegistry withIdentity;
    MockIdentity identity;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address gold = makeAddr("gold");
    address equity = makeAddr("equity");

    function setUp() public {
        vm.warp(1_795_600_000);
        identity = new MockIdentity();
        registry = new MandateRegistry(address(0));
        withIdentity = new MandateRegistry(address(identity));
    }

    function _params() internal view returns (MandateParams memory p) {
        p.agent = agent;
        p.jurisdiction = "SG";
        p.maxPerTradeUsd = 100e18;
        p.maxPerPeriodUsd = 200e18;
        p.periodSeconds = 7 days;
        p.maxVolatilityPpm = 5000;
        p.maxDivergencePpm = 10_000;
        p.maxRiskAgeSeconds = 900;
        p.expiresAt = uint64(block.timestamp + 1 days);
        p.requireMarketOpen = true;
        p.allowedAssets = new address[](1);
        p.allowedAssets[0] = gold;
    }

    function _create() internal returns (uint256 id) {
        vm.prank(owner);
        id = registry.createMandate(_params());
    }

    function test_create_storesAllFieldsAndIndexesOwner() public {
        MandateParams memory p = _params();
        vm.expectEmit(address(registry));
        emit MandateRegistry.MandateCreated(1, owner, agent);
        uint256 id = _create();
        assertEq(id, 1);
        assertEq(registry.mandateCount(), 1);

        Mandate memory m = registry.getMandate(id);
        assertEq(m.owner, owner);
        assertEq(m.agent, agent);
        assertEq(m.jurisdiction, bytes2("SG"));
        assertEq(m.maxPerTradeUsd, 100e18);
        assertEq(m.maxPerPeriodUsd, 200e18);
        assertEq(m.periodSeconds, 7 days);
        assertEq(m.maxVolatilityPpm, 5000);
        assertEq(m.maxDivergencePpm, 10_000);
        assertEq(m.maxRiskAgeSeconds, 900);
        assertEq(m.expiresAt, p.expiresAt);
        assertTrue(m.requireMarketOpen);
        assertTrue(m.active);
        assertEq(m.agentRegistryId, 0);

        assertTrue(registry.isAssetAllowed(id, gold));
        assertFalse(registry.isAssetAllowed(id, equity));

        assertEq(_create(), 2);
        uint256[] memory ids = registry.mandatesByOwner(owner);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(registry.mandatesByOwner(stranger).length, 0);
    }

    function _expectInvalid(MandateParams memory p) internal {
        vm.expectRevert(MandateRegistry.InvalidParams.selector);
        registry.createMandate(p);
    }

    function test_create_rejectsInvalidParams() public {
        MandateParams memory p = _params();
        p.agent = address(0);
        _expectInvalid(p);
        p = _params();
        p.maxPerTradeUsd = 0;
        _expectInvalid(p);
        p = _params();
        p.maxPerPeriodUsd = 0;
        _expectInvalid(p);
        p = _params();
        p.periodSeconds = 0;
        _expectInvalid(p);
        p = _params();
        p.maxRiskAgeSeconds = 0;
        _expectInvalid(p);
        p = _params();
        p.expiresAt = uint64(block.timestamp);
        _expectInvalid(p);
    }

    function test_create_zeroExpiryMeansNoExpiry() public {
        MandateParams memory p = _params();
        p.expiresAt = 0;
        assertEq(registry.getMandate(registry.createMandate(p)).expiresAt, 0);
    }

    function test_setters_changeState() public {
        uint256 id = _create();
        vm.startPrank(owner);
        vm.expectEmit(address(registry));
        emit MandateRegistry.MandateUpdated(id);
        registry.updateLimits(id, 10e18, 20e18, 1 days);
        registry.setAllowedAsset(id, gold, false);
        registry.setAllowedAsset(id, equity, true);
        registry.setJurisdiction(id, "US");
        registry.setVolatilityBreaker(id, 1);
        registry.setDivergenceBreaker(id, 2);
        registry.setMaxRiskAge(id, 60);
        registry.setRequireMarketOpen(id, false);

        Mandate memory m = registry.getMandate(id);
        assertEq(m.maxPerTradeUsd, 10e18);
        assertEq(m.maxPerPeriodUsd, 20e18);
        assertEq(m.periodSeconds, 1 days);
        assertEq(m.jurisdiction, bytes2("US"));
        assertEq(m.maxVolatilityPpm, 1);
        assertEq(m.maxDivergencePpm, 2);
        assertEq(m.maxRiskAgeSeconds, 60);
        assertFalse(m.requireMarketOpen);
        assertFalse(registry.isAssetAllowed(id, gold));
        assertTrue(registry.isAssetAllowed(id, equity));
    }

    function test_update_rejectsZeroLimits() public {
        uint256 id = _create();
        vm.startPrank(owner);
        vm.expectRevert(MandateRegistry.InvalidParams.selector);
        registry.updateLimits(id, 0, 1, 1);
        vm.expectRevert(MandateRegistry.InvalidParams.selector);
        registry.updateLimits(id, 1, 0, 1);
        vm.expectRevert(MandateRegistry.InvalidParams.selector);
        registry.updateLimits(id, 1, 1, 0);
        vm.expectRevert(MandateRegistry.InvalidParams.selector);
        registry.setMaxRiskAge(id, 0);
    }

    function test_onlyOwner_everySetter() public {
        uint256 id = _create();
        bytes[] memory calls = new bytes[](9);
        calls[0] = abi.encodeCall(registry.updateLimits, (id, 1, 1, 1));
        calls[1] = abi.encodeCall(registry.setAllowedAsset, (id, equity, true));
        calls[2] = abi.encodeCall(registry.setJurisdiction, (id, "US"));
        calls[3] = abi.encodeCall(registry.setVolatilityBreaker, (id, 0));
        calls[4] = abi.encodeCall(registry.setDivergenceBreaker, (id, 0));
        calls[5] = abi.encodeCall(registry.setMaxRiskAge, (id, 1));
        calls[6] = abi.encodeCall(registry.setRequireMarketOpen, (id, false));
        calls[7] = abi.encodeCall(registry.revoke, (id));
        calls[8] = abi.encodeCall(registry.reactivate, (id));
        address[2] memory callers = [stranger, agent];
        for (uint256 c; c < callers.length; ++c) {
            for (uint256 i; i < calls.length; ++i) {
                vm.prank(callers[c]);
                (bool ok, bytes memory ret) = address(registry).call(calls[i]);
                assertFalse(ok);
                assertEq(bytes4(ret), MandateRegistry.NotOwner.selector);
            }
        }
    }

    function test_revoke_reactivate() public {
        uint256 id = _create();
        vm.startPrank(owner);
        vm.expectEmit(address(registry));
        emit MandateRegistry.MandateRevoked(id);
        registry.revoke(id);
        assertFalse(registry.getMandate(id).active);
        vm.expectEmit(address(registry));
        emit MandateRegistry.MandateReactivated(id);
        registry.reactivate(id);
        assertTrue(registry.getMandate(id).active);
    }

    function test_identity_mismatchReverts() public {
        identity.set(7, stranger);
        MandateParams memory p = _params();
        p.agentRegistryId = 7;
        vm.expectRevert(MandateRegistry.IdentityMismatch.selector);
        withIdentity.createMandate(p);
    }

    function test_identity_matchAccepted() public {
        identity.set(7, agent);
        MandateParams memory p = _params();
        p.agentRegistryId = 7;
        uint256 id = withIdentity.createMandate(p);
        assertEq(withIdentity.getMandate(id).agentRegistryId, 7);
    }

    function test_identity_offRejectsNonzeroId() public {
        MandateParams memory p = _params();
        p.agentRegistryId = 7;
        _expectInvalid(p);
    }

    function test_jurisdiction_mustBeTwoUppercaseLetters() public {
        uint256 id = _create();
        bytes2[6] memory bad = [bytes2(0), bytes2("us"), bytes2("Us"), bytes2("U"), bytes2("U1"), bytes2("[S")];
        for (uint256 i; i < bad.length; ++i) {
            MandateParams memory p = _params();
            p.jurisdiction = bad[i];
            _expectInvalid(p);
            vm.prank(owner);
            vm.expectRevert(MandateRegistry.InvalidParams.selector);
            registry.setJurisdiction(id, bad[i]);
        }
        vm.prank(owner);
        registry.setJurisdiction(id, "AZ");
        assertEq(registry.getMandate(id).jurisdiction, bytes2("AZ"));
    }

    function test_unknownMandateReverts() public {
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, 0));
        registry.getMandate(0);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, 1));
        registry.getMandate(1);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, 1));
        registry.revoke(1);
    }
}
