// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Market calendar
/// @notice Says whether the market behind a tokenized equity is open.
/// @dev Hackathon simplification: US winter hours only, holidays and early closes set by an admin.
contract MarketCalendar is AccessControl {
    uint32 public constant OPEN_SECOND = 52_200; // 14:30 UTC
    uint32 public constant CLOSE_SECOND = 75_600; // 21:00 UTC

    /// @notice Assets without a calendar are always open.
    mapping(address asset => bool) public hasCalendar;
    /// @notice Keyed by unix day (timestamp / 86400).
    mapping(uint32 day => bool) public isHoliday;
    /// @notice Closing second of the day in UTC, 0 means the regular close.
    mapping(uint32 day => uint32) public earlyClose;

    event CalendarSet(address indexed asset, bool enabled);
    event HolidaySet(uint32 indexed day, bool holiday);
    event EarlyCloseSet(uint32 indexed day, uint32 closeSecond);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setHasCalendar(address asset, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        hasCalendar[asset] = enabled;
        emit CalendarSet(asset, enabled);
    }

    function setHoliday(uint32 day, bool holiday) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isHoliday[day] = holiday;
        emit HolidaySet(day, holiday);
    }

    function setEarlyClose(uint32 day, uint32 closeSecond) external onlyRole(DEFAULT_ADMIN_ROLE) {
        earlyClose[day] = closeSecond;
        emit EarlyCloseSet(day, closeSecond);
    }

    function isOpen(address asset, uint64 timestamp) external view returns (bool) {
        if (!hasCalendar[asset]) return true;

        uint32 day = uint32(timestamp / 1 days);
        uint32 weekday = (day + 4) % 7; // 1 January 1970 was a Thursday; 0 = Sunday
        if (weekday == 0 || weekday == 6 || isHoliday[day]) return false;

        uint32 second = uint32(timestamp % 1 days);
        uint32 close = earlyClose[day] == 0 ? CLOSE_SECOND : earlyClose[day];
        return second >= OPEN_SECOND && second < close;
    }
}
