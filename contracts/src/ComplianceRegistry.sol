// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Compliance registry
/// @notice Platform rules: which assets are restricted per jurisdiction and which venues may be used.
/// @dev Hackathon simplification: lists are managed by an admin.
contract ComplianceRegistry is AccessControl {
    /// @notice Restriction per asset and ISO 3166-1 alpha-2 country code, e.g. "US".
    mapping(address asset => mapping(bytes2 jurisdiction => bool)) public isRestricted;

    mapping(address venue => bool) private _approved;
    mapping(address venue => bool) private _denied;

    event AssetRestrictionSet(address indexed asset, bytes2 indexed jurisdiction, bool restricted);
    event VenueApprovedSet(address indexed venue, bool approved);
    event VenueDeniedSet(address indexed venue, bool denied);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setAssetRestriction(address asset, bytes2 jurisdiction, bool restricted)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        isRestricted[asset][jurisdiction] = restricted;
        emit AssetRestrictionSet(asset, jurisdiction, restricted);
    }

    function setVenueApproved(address venue, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _approved[venue] = approved;
        emit VenueApprovedSet(venue, approved);
    }

    function setVenueDenied(address venue, bool denied) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _denied[venue] = denied;
        emit VenueDeniedSet(venue, denied);
    }

    function venueStatus(address venue) external view returns (bool approved, bool denied) {
        return (_approved[venue], _denied[venue]);
    }
}
