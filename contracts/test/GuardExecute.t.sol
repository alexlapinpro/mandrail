// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base} from "./Base.t.sol";
import {ShortVenue, UnderTakeVenue, ReentrantVenue} from "./mocks/Venues.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {RogueVenue} from "../src/RogueVenue.sol";
import {RWAMarket} from "../src/RWAMarket.sol";
import {MandateParams, Reason} from "../src/Types.sol";

contract GuardExecuteTest is Base {
    RWAMarket market;
    RogueVenue rogue;

    function setUp() public override {
        super.setUp();
        market = new RWAMarket(admin, usd, oracle);
        rogue = new RogueVenue(usd);
        vm.startPrank(admin);
        market.setSupported(address(gold), true);
        market.setSupported(address(equity), true);
        gold.grantRole(gold.MINTER_ROLE(), address(market));
        equity.grantRole(equity.MINTER_ROLE(), address(market));
        compliance.setVenueApproved(address(market), true);
        vm.stopPrank();
    }

    function _trade(address asset, address v, uint256 amount) internal returns (bool ok, Reason reason) {
        vm.prank(agent);
        (ok, reason) = guard.executeTrade(id, asset, v, amount, 0);
    }

    function _buyGold(uint256 amount) internal {
        (bool ok,) = _trade(address(gold), address(market), amount);
        assertTrue(ok);
    }

    function test_happyPath() public {
        uint256 out = 50e18 * 1e18 / GOLD_PRICE;
        vm.expectEmit(address(guard));
        emit PolicyGuard.TradeExecuted(id, agent, address(gold), address(market), 50e18, out, GOLD_PRICE);
        (bool ok, Reason reason) = _trade(address(gold), address(market), 50e18);

        assertTrue(ok);
        _assertReason(reason, Reason.OK);
        assertEq(gold.balanceOf(owner), out);
        assertEq(gold.balanceOf(address(guard)), 0);
        assertEq(guard.balanceOf(id), 250e18);
        assertEq(usd.balanceOf(address(guard)), 250e18);
        assertEq(usd.balanceOf(address(market)), 50e18);
        assertEq(guard.spentInPeriod(id), 50e18);
        assertEq(usd.allowance(address(guard), address(market)), 0);
    }

    /// @dev Attempts a trade that must be blocked and proves that only the event happened.
    function _blocked(address caller, address asset, address v, uint256 amount, Reason expected) internal {
        (Reason reason, bytes memory ctx) = guard.checkTrade(id, caller, asset, v, amount);
        _assertReason(reason, expected);
        uint256[6] memory before = _snapshot(asset);

        vm.expectEmit(address(guard));
        emit PolicyGuard.TradeBlocked(id, caller, asset, v, amount, expected, ctx);
        vm.prank(caller);
        (bool ok, Reason got) = guard.executeTrade(id, asset, v, amount, 0);

        assertFalse(ok);
        _assertReason(got, expected);
        uint256[6] memory afterwards = _snapshot(asset);
        for (uint256 i; i < 6; ++i) {
            assertEq(afterwards[i], before[i], "state moved");
        }
    }

    function _snapshot(address asset) internal view returns (uint256[6] memory s) {
        s[0] = usd.balanceOf(address(guard));
        s[1] = usd.balanceOf(address(market));
        s[2] = guard.balanceOf(id);
        s[3] = guard.spentInPeriod(id);
        s[4] = guard.periodStart(id);
        s[5] = asset == address(gold) ? gold.balanceOf(owner) : equity.balanceOf(owner);
    }

    function test_blocked_notAgent() public {
        _blocked(stranger, address(gold), address(market), 50e18, Reason.NOT_AGENT);
    }

    function test_blocked_inactive_thenWithdrawWorks() public {
        vm.prank(owner);
        registry.revoke(id);
        _blocked(agent, address(gold), address(market), 50e18, Reason.MANDATE_INACTIVE);
        vm.prank(owner);
        guard.withdraw(id, 300e18);
        assertEq(usd.balanceOf(owner), 300e18);
        assertEq(guard.balanceOf(id), 0);
    }

    function test_blocked_expired() public {
        MandateParams memory p = _params();
        p.expiresAt = NOW + 10;
        vm.prank(owner);
        id = registry.createMandate(p);
        vm.warp(NOW + 10);
        _blocked(agent, address(gold), address(market), 50e18, Reason.MANDATE_EXPIRED);
    }

    function test_blocked_assetNotAllowed() public {
        _blocked(agent, address(equity), address(market), 50e18, Reason.ASSET_NOT_ALLOWED);
    }

    function test_blocked_jurisdiction() public {
        _allowEquity();
        vm.prank(owner);
        registry.setJurisdiction(id, "US");
        _blocked(agent, address(equity), address(market), 50e18, Reason.JURISDICTION_RESTRICTED);
    }

    function test_blocked_rogueVenue() public {
        _blocked(agent, address(gold), address(rogue), 50e18, Reason.VENUE_DENIED);
    }

    function test_blocked_perTrade() public {
        _blocked(agent, address(gold), address(market), 150e18, Reason.EXCEEDS_PER_TRADE);
    }

    function test_blocked_period() public {
        _buyGold(100e18);
        _buyGold(60e18);
        _blocked(agent, address(gold), address(market), 41e18, Reason.EXCEEDS_PERIOD);
        _buyGold(40e18);
    }

    function test_blocked_stale() public {
        vm.warp(NOW + 901);
        _blocked(agent, address(gold), address(market), 50e18, Reason.RISK_DATA_STALE);
    }

    function test_blocked_divergence() public {
        _allowEquity();
        vm.prank(owner);
        registry.setDivergenceBreaker(id, 10_000);
        _push(address(equity), 150e18, 0, 140e18, NOW);
        _blocked(agent, address(equity), address(market), 50e18, Reason.PRICE_DIVERGENCE);
    }

    function test_blocked_volatility() public {
        vm.prank(owner);
        registry.setVolatilityBreaker(id, 50);
        _blocked(agent, address(gold), address(market), 50e18, Reason.VOLATILITY_BREAKER);
    }

    function test_blocked_insufficientBalance() public {
        vm.prank(owner);
        guard.withdraw(id, 260e18);
        _blocked(agent, address(gold), address(market), 50e18, Reason.INSUFFICIENT_BALANCE);
    }

    function test_blocked_marketClosed() public {
        _allowEquity();
        vm.prank(owner);
        registry.setRequireMarketOpen(id, true);
        vm.warp(NOW + 8 hours);
        _push(address(equity), EQUITY_PRICE, 0, EQUITY_PRICE, NOW + 8 hours);
        _blocked(agent, address(equity), address(market), 50e18, Reason.UNDERLYING_MARKET_CLOSED);
    }

    function test_periodStartsAtFirstTrade() public {
        assertEq(guard.periodStart(id), 0);
        vm.warp(NOW + 3 days);
        _push(address(gold), GOLD_PRICE, 0, 0, 0);
        _buyGold(10e18);
        assertEq(guard.periodStart(id), NOW + 3 days);
    }

    function test_periodRollover() public {
        _buyGold(100e18);
        _buyGold(100e18);
        vm.warp(NOW + 7 days - 1);
        _push(address(gold), GOLD_PRICE, 0, 0, 0);
        _blocked(agent, address(gold), address(market), 1e18, Reason.EXCEEDS_PERIOD);
        vm.warp(NOW + 7 days);
        assertEq(guard.spentInPeriod(id), 0);
        _buyGold(100e18);
        assertEq(guard.spentInPeriod(id), 100e18);
        assertEq(guard.periodStart(id), NOW + 7 days);
    }

    function test_withdraw_accountsAndEmits() public {
        vm.prank(owner);
        vm.expectEmit(address(guard));
        emit PolicyGuard.Withdrawn(id, 120e18);
        guard.withdraw(id, 120e18);
        assertEq(guard.balanceOf(id), 180e18);
        assertEq(usd.balanceOf(owner), 120e18);
    }

    function test_withdraw_onlyOwner_nonZero_withinBalance() public {
        vm.prank(agent);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.withdraw(id, 1);
        vm.startPrank(owner);
        vm.expectRevert(PolicyGuard.ZeroAmount.selector);
        guard.withdraw(id, 0);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.ExceedsBalance.selector, 300e18 + 1, 300e18));
        guard.withdraw(id, 300e18 + 1);
    }

    function _approveVenue(address v) internal {
        vm.startPrank(admin);
        compliance.setVenueApproved(v, true);
        gold.grantRole(gold.MINTER_ROLE(), v);
        vm.stopPrank();
    }

    function test_shortVenue_belowMinimumReverts() public {
        ShortVenue v = new ShortVenue(usd);
        _approveVenue(address(v));
        uint256 min = (50e18 * 1e18 / GOLD_PRICE) * 99 / 100;
        v.setDeliver(min - 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.TooLittleReceived.selector, min - 1, min));
        guard.executeTrade(id, address(gold), address(v), 50e18, 0);

        v.setDeliver(min);
        (bool ok,) = _trade(address(gold), address(v), 50e18);
        assertTrue(ok);
    }

    function test_rogueVenue_cannotKeepMoneyEvenIfApproved() public {
        _approveVenue(address(rogue));
        uint256 min = (50e18 * 1e18 / GOLD_PRICE) * 99 / 100;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.TooLittleReceived.selector, 0, min));
        guard.executeTrade(id, address(gold), address(rogue), 50e18, 0);
        assertEq(usd.balanceOf(address(rogue)), 0);
    }

    function test_underTakeVenueReverts() public {
        UnderTakeVenue v = new UnderTakeVenue(usd);
        _approveVenue(address(v));
        vm.prank(agent);
        vm.expectRevert(PolicyGuard.WrongUsdTaken.selector);
        guard.executeTrade(id, address(gold), address(v), 50e18, 0);
    }

    function test_reentrantVenueReverts() public {
        ReentrantVenue v = new ReentrantVenue(guard);
        _approveVenue(address(v));
        MandateParams memory p = _params();
        p.agent = address(v);
        vm.prank(owner);
        uint256 id2 = registry.createMandate(p);
        _deposit(id2, owner, 100e18);
        v.setMandate(id2);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        v.attack(address(gold), 10e18);
    }

    function test_agentMinHigherIsRespected() public {
        uint256 out = 50e18 * 1e18 / GOLD_PRICE;
        vm.startPrank(agent);
        vm.expectRevert(abi.encodeWithSelector(RWAMarket.Slippage.selector, out, out + 1));
        guard.executeTrade(id, address(gold), address(market), 50e18, out + 1);
        (bool ok,) = guard.executeTrade(id, address(gold), address(market), 50e18, out);
        assertTrue(ok);
    }

    function test_dustAmountReverts() public {
        vm.prank(agent);
        vm.expectRevert(PolicyGuard.AmountTooSmall.selector);
        guard.executeTrade(id, address(gold), address(market), 1, 0);
    }

    function test_twoMandates_balancesIsolated() public {
        address owner2 = makeAddr("owner2");
        uint256 id2 = _createMandate(owner2);
        vm.prank(agent);
        (bool ok, Reason reason) = guard.executeTrade(id2, address(gold), address(market), 10e18, 0);
        assertFalse(ok);
        _assertReason(reason, Reason.INSUFFICIENT_BALANCE);
        vm.prank(owner2);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.ExceedsBalance.selector, 1, 0));
        guard.withdraw(id2, 1);
        assertEq(guard.balanceOf(id), 300e18);
    }

    function test_market_onlySupportedAsset_andOnlyOwnerManages() public {
        vm.prank(admin);
        market.setSupported(address(gold), false);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(RWAMarket.UnsupportedAsset.selector, address(gold)));
        guard.executeTrade(id, address(gold), address(market), 50e18, 0);
        vm.prank(stranger);
        vm.expectRevert();
        market.setSupported(address(gold), true);
    }

    function test_market_noPriceReverts() public {
        address asset = makeAddr("noPrice");
        vm.prank(admin);
        market.setSupported(asset, true);
        vm.expectRevert(abi.encodeWithSelector(RWAMarket.NoPrice.selector, asset));
        market.buy(asset, 1e18, 0, owner);
    }

    function testFuzz_spentNeverExceedsPeriod(uint96[8] memory amounts, uint32[8] memory gaps) public {
        _deposit(id, owner, 10_000e18);
        uint256 windowStart;
        uint256 windowSpent;
        for (uint256 i; i < 8; ++i) {
            vm.warp(block.timestamp + gaps[i] % 5 days);
            _push(address(gold), GOLD_PRICE, 0, 0, 0);
            uint256 amount = bound(amounts[i], 1e15, 150e18);
            (bool ok,) = _trade(address(gold), address(market), amount);
            if (ok) {
                if (block.timestamp >= windowStart + 7 days) {
                    windowStart = block.timestamp;
                    windowSpent = 0;
                }
                windowSpent += amount;
                assertLe(amount, 100e18);
            }
            assertLe(windowSpent, 200e18);
            assertLe(guard.spentInPeriod(id), 200e18);
        }
    }

    function testFuzz_guardBalanceEqualsSumOfMandates(uint96[8] memory amounts) public {
        address owner2 = makeAddr("owner2");
        uint256 id2 = _createMandate(owner2);
        _deposit(id2, owner2, 500e18);
        for (uint256 i; i < 8; ++i) {
            uint256 target = i % 2 == 0 ? id : id2;
            vm.prank(agent);
            guard.executeTrade(target, address(gold), address(market), bound(amounts[i], 1e15, 150e18), 0);
            assertEq(usd.balanceOf(address(guard)), guard.balanceOf(id) + guard.balanceOf(id2));
        }
    }
}
