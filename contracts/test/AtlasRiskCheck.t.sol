// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AtlasRiskCheck} from "../src/AtlasRiskCheck.sol";
import {IAtlasFeed} from "../src/interfaces/IAtlasFeed.sol";
import {Reason} from "../src/Types.sol";

contract MockAtlas is IAtlasFeed {
    uint256 price;
    uint256 timestamp;

    function set(uint256 price_, uint256 timestamp_) external {
        price = price_;
        timestamp = timestamp_;
    }

    function fetch(bytes4) external view returns (uint256, uint256, uint256) {
        return (price, timestamp, timestamp);
    }
}

contract AtlasRiskCheckTest is Test {
    uint64 constant NOW = 1_795_618_800;
    bytes4 constant FEED = bytes4(uint32(934));
    MockAtlas atlas;
    AtlasRiskCheck checker;

    function setUp() public {
        vm.warp(NOW);
        atlas = new MockAtlas();
        checker = new AtlasRiskCheck(atlas);
        atlas.set(100e18, NOW - 10);
    }

    function _check(uint256 ref, uint32 maxPpm, uint64 maxAge, Reason expected, uint256 gap) internal view {
        (Reason reason, uint256 price, uint64 ts, uint256 gapPpm) = checker.check(FEED, ref, maxPpm, maxAge);
        assertEq(uint8(reason), uint8(expected), "reason");
        assertEq(price, 100e18);
        assertEq(ts, NOW - 10);
        assertEq(gapPpm, gap);
    }

    function test_samePrice_ok() public view {
        _check(100e18, 10_000, 60, Reason.OK, 0);
    }

    function test_gap_atLimitPasses_aboveBlocks_bothSides() public view {
        _check(101e18, 10_000, 60, Reason.OK, 10_000);
        _check(99e18, 10_000, 60, Reason.OK, 10_000);
        _check(102e18, 10_000, 60, Reason.PRICE_DIVERGENCE, 20_000);
        _check(98e18, 10_000, 60, Reason.PRICE_DIVERGENCE, 20_000);
    }

    function test_zeroLimitSwitchesTheGapOff() public view {
        _check(200e18, 0, 60, Reason.OK, 1_000_000);
    }

    function test_age_limitIsInclusive() public view {
        _check(100e18, 10_000, 10, Reason.OK, 0);
        _check(100e18, 10_000, 9, Reason.RISK_DATA_STALE, 0);
    }

    function test_staleWinsOverGap() public view {
        _check(102e18, 10_000, 9, Reason.RISK_DATA_STALE, 20_000);
    }

    function test_zeroPriceIsStale() public {
        atlas.set(0, NOW);
        (Reason reason,,, uint256 gap) = checker.check(FEED, 100e18, 10_000, 60);
        assertEq(uint8(reason), uint8(Reason.RISK_DATA_STALE));
        assertEq(gap, 0);
    }

    function test_zeroTimestampIsStale() public {
        atlas.set(100e18, 0);
        (Reason reason,,,) = checker.check(FEED, 100e18, 10_000, type(uint64).max);
        assertEq(uint8(reason), uint8(Reason.RISK_DATA_STALE));
    }

    function test_futureTimestampHasAgeZero() public {
        atlas.set(100e18, NOW + 5);
        (Reason reason,,,) = checker.check(FEED, 100e18, 10_000, 0);
        assertEq(uint8(reason), uint8(Reason.OK));
    }
}
