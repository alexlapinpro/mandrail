// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployAtlasCheck} from "../../script/DeployAtlasCheck.s.sol";
import {AtlasRiskCheck} from "../../src/AtlasRiskCheck.sol";
import {Reason} from "../../src/Types.sol";

/// @dev Reads the real Atlas feeds on a local fork of BSC mainnet. Runs only when FORK_RPC_URL is set.
contract AtlasMainnetTest is Test {
    bytes4 constant NVDAB = bytes4(uint32(934));
    bytes4 constant EMPTY_FEED = bytes4(uint32(633));
    AtlasRiskCheck checker;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return vm.skip(true);
        vm.createSelectFork(rpc);
        checker = new DeployAtlasCheck().deploy(0xA11CE);
    }

    function test_liveFeed() public view {
        (, uint256 price, uint64 ts,) = checker.check(NVDAB, 1e18, 0, type(uint64).max);
        assertGt(price, 1e18);
        assertGt(ts, 1_795_600_000);

        (Reason reason,,, uint256 gap) = checker.check(NVDAB, price, 10_000, type(uint64).max);
        assertEq(uint8(reason), uint8(Reason.OK));
        assertEq(gap, 0);

        (reason,,,) = checker.check(NVDAB, price * 102 / 100, 10_000, type(uint64).max);
        assertEq(uint8(reason), uint8(Reason.PRICE_DIVERGENCE));
    }

    function test_emptyFeedIsStale() public view {
        (Reason reason,,,) = checker.check(EMPTY_FEED, 1e18, 10_000, type(uint64).max);
        assertEq(uint8(reason), uint8(Reason.RISK_DATA_STALE));
    }
}
