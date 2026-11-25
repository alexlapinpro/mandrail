// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MarketCalendar} from "../src/MarketCalendar.sol";

contract MarketCalendarTest is Test {
    MarketCalendar cal;
    address admin = makeAddr("admin");
    address stranger = makeAddr("stranger");
    address asset = makeAddr("asset");

    uint64 constant WED_25_NOV = 1_795_564_800; // 2026-11-25 00:00 UTC
    uint64 constant DAY = 86_400;
    uint64 constant H15 = 15 hours;

    function setUp() public {
        cal = new MarketCalendar(admin);
        vm.prank(admin);
        cal.setHasCalendar(asset, true);
    }

    function test_noCalendar_alwaysOpen() public {
        assertTrue(cal.isOpen(makeAddr("gold"), WED_25_NOV));
        assertTrue(cal.isOpen(makeAddr("gold"), WED_25_NOV + 3 * DAY));
    }

    function test_hours() public view {
        assertFalse(cal.isOpen(asset, WED_25_NOV + 14 hours + 30 minutes - 1));
        assertTrue(cal.isOpen(asset, WED_25_NOV + 14 hours + 30 minutes));
        assertTrue(cal.isOpen(asset, WED_25_NOV + 21 hours - 1));
        assertFalse(cal.isOpen(asset, WED_25_NOV + 21 hours));
    }

    function test_weekend() public view {
        assertTrue(cal.isOpen(asset, WED_25_NOV + 2 * DAY + H15)); // Fri
        assertFalse(cal.isOpen(asset, WED_25_NOV + 3 * DAY + H15)); // Sat
        assertFalse(cal.isOpen(asset, WED_25_NOV + 4 * DAY + H15)); // Sun
        assertTrue(cal.isOpen(asset, WED_25_NOV + 5 * DAY + H15)); // Mon
    }

    function test_holiday() public {
        uint32 thu = uint32((WED_25_NOV + DAY) / DAY);
        assertTrue(cal.isOpen(asset, WED_25_NOV + DAY + H15));
        vm.startPrank(admin);
        cal.setHoliday(thu, true);
        assertFalse(cal.isOpen(asset, WED_25_NOV + DAY + H15));
        cal.setHoliday(thu, false);
        assertTrue(cal.isOpen(asset, WED_25_NOV + DAY + H15));
    }

    function test_earlyClose() public {
        uint32 fri = uint32((WED_25_NOV + 2 * DAY) / DAY);
        vm.startPrank(admin);
        cal.setEarlyClose(fri, 64_800);
        assertTrue(cal.isOpen(asset, WED_25_NOV + 2 * DAY + 18 hours - 1));
        assertFalse(cal.isOpen(asset, WED_25_NOV + 2 * DAY + 18 hours));
        cal.setEarlyClose(fri, 0);
        assertTrue(cal.isOpen(asset, WED_25_NOV + 2 * DAY + 18 hours));
    }

    function test_onlyAdmin() public {
        bytes memory err = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, cal.DEFAULT_ADMIN_ROLE()
        );
        vm.startPrank(stranger);
        vm.expectRevert(err);
        cal.setHasCalendar(asset, false);
        vm.expectRevert(err);
        cal.setHoliday(1, true);
        vm.expectRevert(err);
        cal.setEarlyClose(1, 1);
    }
}
