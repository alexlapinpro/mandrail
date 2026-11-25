// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {RiskOracle} from "../src/RiskOracle.sol";
import {RiskData, RiskInput} from "../src/Types.sol";

contract RiskOracleTest is Test {
    RiskOracle oracle;
    address admin = makeAddr("admin");
    address attester = makeAddr("attester");
    address stranger = makeAddr("stranger");
    address asset = makeAddr("asset");
    address asset2 = makeAddr("asset2");
    uint64 constant NOW = 1_795_600_000;

    function setUp() public {
        vm.warp(NOW);
        oracle = new RiskOracle(admin, attester);
    }

    function _input(uint256 price, uint64 ts) internal pure returns (RiskInput memory i) {
        i.priceUsd = price;
        i.change1hPpm = -23_500;
        i.change24hPpm = 12_000;
        i.sourceTimestamp = ts;
    }

    function _push(RiskInput memory i) internal {
        vm.prank(attester);
        oracle.update(asset, i);
    }

    function test_update_storesAndSetsUpdatedAtFromBlock() public {
        RiskInput memory i = _input(4000e18, NOW - 30);
        i.atlasPriceUsd = 4001e18;
        i.atlasTimestamp = NOW - 5;
        vm.expectEmit(address(oracle));
        emit RiskOracle.RiskUpdated(asset, 4000e18, -23_500, 12_000, NOW - 30, 4001e18, NOW - 5);
        _push(i);
        RiskData memory d = oracle.getRisk(asset);
        assertEq(d.updatedAt, NOW);
        assertEq(d.sourceTimestamp, NOW - 30);
        assertEq(d.priceUsd, 4000e18);
        assertEq(d.change1hPpm, -23_500);
        assertEq(d.change24hPpm, 12_000);
        assertEq(d.atlasPriceUsd, 4001e18);
        assertEq(d.atlasTimestamp, NOW - 5);
    }

    function test_update_onlyAttester() public {
        bytes32 role = oracle.ATTESTER_ROLE();
        bytes memory err =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role);
        vm.startPrank(stranger);
        vm.expectRevert(err);
        oracle.update(asset, _input(1e18, NOW));
        vm.expectRevert(err);
        oracle.updateBatch(new address[](0), new RiskInput[](0));
    }

    function test_update_rejectsZeroPrice() public {
        vm.expectRevert(RiskOracle.ZeroPrice.selector);
        _push(_input(0, NOW));
    }

    function test_update_rejectsOlderSource() public {
        _push(_input(1e18, NOW - 60));
        _push(_input(2e18, NOW - 60)); // equal is accepted
        assertEq(oracle.getRisk(asset).priceUsd, 2e18);
        vm.expectRevert(RiskOracle.SourceTooOld.selector);
        _push(_input(3e18, NOW - 61));
    }

    function test_update_futureLimit() public {
        _push(_input(1e18, NOW + 300));
        vm.expectRevert(RiskOracle.SourceInFuture.selector);
        _push(_input(1e18, NOW + 301));

        RiskInput memory i = _input(1e18, NOW + 300);
        i.atlasPriceUsd = 1e18;
        i.atlasTimestamp = NOW + 301;
        vm.expectRevert(RiskOracle.SourceInFuture.selector);
        _push(i);
    }

    function test_updateBatch_updatesEach_andChecksLength() public {
        address[] memory assets = new address[](2);
        assets[0] = asset;
        assets[1] = asset2;
        RiskInput[] memory data = new RiskInput[](2);
        data[0] = _input(1e18, NOW);
        data[1] = _input(2e18, NOW);
        vm.startPrank(attester);
        oracle.updateBatch(assets, data);
        assertEq(oracle.getRisk(asset).priceUsd, 1e18);
        assertEq(oracle.getRisk(asset2).priceUsd, 2e18);

        vm.expectRevert(RiskOracle.LengthMismatch.selector);
        oracle.updateBatch(assets, new RiskInput[](1));
    }

    function test_update_keepsAtlasWhenMissing() public {
        RiskInput memory i = _input(1e18, NOW);
        i.atlasPriceUsd = 5e18;
        i.atlasTimestamp = NOW - 10;
        _push(i);
        _push(_input(2e18, NOW));
        RiskData memory d = oracle.getRisk(asset);
        assertEq(d.priceUsd, 2e18);
        assertEq(d.atlasPriceUsd, 5e18);
        assertEq(d.atlasTimestamp, NOW - 10);
    }

    function test_update_keepsAtlasWhenOlder() public {
        RiskInput memory i = _input(1e18, NOW);
        i.atlasPriceUsd = 5e18;
        i.atlasTimestamp = NOW - 10;
        _push(i);
        i.priceUsd = 2e18;
        i.atlasPriceUsd = 9e18;
        i.atlasTimestamp = NOW - 11;
        _push(i);
        RiskData memory d = oracle.getRisk(asset);
        assertEq(d.priceUsd, 2e18);
        assertEq(d.atlasPriceUsd, 5e18);
        assertEq(d.atlasTimestamp, NOW - 10);
    }

    function test_adminSettings() public {
        assertEq(oracle.maxAtlasAge(), 3600);
        assertFalse(oracle.requiresSecondSource(asset));

        bytes memory err = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, oracle.DEFAULT_ADMIN_ROLE()
        );
        vm.startPrank(stranger);
        vm.expectRevert(err);
        oracle.setMaxAtlasAge(60);
        vm.expectRevert(err);
        oracle.setRequiresSecondSource(asset, true);
        vm.stopPrank();

        vm.startPrank(admin);
        oracle.setMaxAtlasAge(60);
        oracle.setRequiresSecondSource(asset, true);
        assertEq(oracle.maxAtlasAge(), 60);
        assertTrue(oracle.requiresSecondSource(asset));
    }
}
