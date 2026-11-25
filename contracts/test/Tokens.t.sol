// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {TestRWA} from "../src/TestRWA.sol";

contract TokensTest is Test {
    TestUSD usd;
    TestRWA gold;
    address admin = makeAddr("admin");
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_795_600_000);
        usd = new TestUSD("Mandrail Test USD", "tUSD");
        gold = new TestRWA("Mandrail Test Tokenized Gold", "tGOLD", admin);
        bytes32 role = gold.MINTER_ROLE();
        vm.prank(admin);
        gold.grantRole(role, minter);
    }

    function test_faucet_mints1000_thenCooldown() public {
        vm.startPrank(alice);
        usd.faucet();
        assertEq(usd.balanceOf(alice), 1000e18);

        uint256 availableAt = block.timestamp + 1 hours;
        vm.expectRevert(abi.encodeWithSelector(TestUSD.FaucetCooldown.selector, availableAt));
        usd.faucet();

        vm.warp(availableAt);
        usd.faucet();
        assertEq(usd.balanceOf(alice), 2000e18);
    }

    function test_faucet_isPerAddress() public {
        vm.prank(alice);
        usd.faucet();
        vm.prank(bob);
        usd.faucet();
        assertEq(usd.balanceOf(bob), 1000e18);
    }

    function test_rwa_onlyMinter() public {
        bytes32 role = gold.MINTER_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role)
        );
        gold.mint(alice, 1e18);

        vm.prank(minter);
        gold.mint(alice, 1e18);
        assertEq(gold.balanceOf(alice), 1e18);
    }

    function test_names_markTestAsset() public view {
        assertEq(usd.name(), "Mandrail Test USD");
        assertEq(gold.name(), "Mandrail Test Tokenized Gold");
        assertEq(usd.symbol(), "tUSD");
        assertEq(gold.symbol(), "tGOLD");
        assertEq(usd.decimals(), 18);
        assertEq(gold.decimals(), 18);
    }
}
