// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

contract ComplianceTest is Test {
    ComplianceRegistry registry;
    address admin = makeAddr("admin");
    address stranger = makeAddr("stranger");
    address asset = makeAddr("asset");
    address venue = makeAddr("venue");

    function setUp() public {
        registry = new ComplianceRegistry(admin);
    }

    function test_restriction_roundTrip_perJurisdiction() public {
        assertFalse(registry.isRestricted(asset, "US"));
        vm.startPrank(admin);
        vm.expectEmit(address(registry));
        emit ComplianceRegistry.AssetRestrictionSet(asset, "US", true);
        registry.setAssetRestriction(asset, "US", true);
        assertTrue(registry.isRestricted(asset, "US"));
        assertFalse(registry.isRestricted(asset, "SG"));
        registry.setAssetRestriction(asset, "US", false);
        assertFalse(registry.isRestricted(asset, "US"));
    }

    function test_venue_unknownIsNeitherApprovedNorDenied() public view {
        (bool approved, bool denied) = registry.venueStatus(venue);
        assertFalse(approved);
        assertFalse(denied);
    }

    function test_venue_approvedAndDeniedAreIndependent() public {
        vm.startPrank(admin);
        vm.expectEmit(address(registry));
        emit ComplianceRegistry.VenueApprovedSet(venue, true);
        registry.setVenueApproved(venue, true);
        vm.expectEmit(address(registry));
        emit ComplianceRegistry.VenueDeniedSet(venue, true);
        registry.setVenueDenied(venue, true);
        (bool approved, bool denied) = registry.venueStatus(venue);
        assertTrue(approved);
        assertTrue(denied);
        registry.setVenueApproved(venue, false);
        (approved, denied) = registry.venueStatus(venue);
        assertFalse(approved);
        assertTrue(denied);
    }

    function test_onlyAdmin() public {
        bytes memory err = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.DEFAULT_ADMIN_ROLE()
        );
        vm.startPrank(stranger);
        vm.expectRevert(err);
        registry.setAssetRestriction(asset, "US", true);
        vm.expectRevert(err);
        registry.setVenueApproved(venue, true);
        vm.expectRevert(err);
        registry.setVenueDenied(venue, true);
    }
}
