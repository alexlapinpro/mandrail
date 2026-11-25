// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {MandateParams, Reason, RiskInput} from "../src/Types.sol";

contract GuardChecksTest is Base {
    function _check(address caller, address asset, address v, uint256 amount, Reason expected, bytes memory ctx)
        internal
        view
    {
        (Reason reason, bytes memory context) = guard.checkTrade(id, caller, asset, v, amount);
        _assertReason(reason, expected);
        assertEq(context, ctx, "context");
    }

    function _checkGold(uint256 amount, Reason expected, bytes memory ctx) internal view {
        _check(agent, address(gold), venue, amount, expected, ctx);
    }

    function _checkEquity(Reason expected, bytes memory ctx) internal view {
        _check(agent, address(equity), venue, 50e18, expected, ctx);
    }

    function test_ok() public view {
        _checkGold(50e18, Reason.OK, "");
    }

    function test_notAgent() public view {
        _check(stranger, address(gold), venue, 50e18, Reason.NOT_AGENT, abi.encode(stranger, agent));
        _check(owner, address(gold), venue, 50e18, Reason.NOT_AGENT, abi.encode(owner, agent));
    }

    function test_inactive() public {
        vm.prank(owner);
        registry.revoke(id);
        _checkGold(50e18, Reason.MANDATE_INACTIVE, "");
    }

    function test_expired_atExactSecond() public {
        MandateParams memory p = _params();
        p.expiresAt = NOW + 100;
        vm.prank(owner);
        id = registry.createMandate(p);
        _deposit(id, owner, 100e18);
        vm.warp(NOW + 99);
        _checkGold(50e18, Reason.OK, "");
        vm.warp(NOW + 100);
        _checkGold(50e18, Reason.MANDATE_EXPIRED, abi.encode(NOW + 100, NOW + 100));
    }

    function test_assetNotAllowed() public view {
        _checkEquity(Reason.ASSET_NOT_ALLOWED, abi.encode(address(equity)));
    }

    function test_jurisdictionRestricted() public {
        _allowEquity();
        _checkEquity(Reason.OK, "");
        vm.prank(owner);
        registry.setJurisdiction(id, "US");
        _checkEquity(Reason.JURISDICTION_RESTRICTED, abi.encode(address(equity), bytes2("US")));
    }

    function test_venueUnapproved() public view {
        _check(agent, address(gold), stranger, 50e18, Reason.VENUE_DENIED, abi.encode(stranger, false, false));
    }

    function test_venueDeniedEvenIfApproved() public {
        vm.prank(admin);
        compliance.setVenueDenied(venue, true);
        _checkGold(50e18, Reason.VENUE_DENIED, abi.encode(venue, true, true));
    }

    function test_perTrade_equalPasses_aboveBlocks() public view {
        _checkGold(100e18, Reason.OK, "");
        _checkGold(100e18 + 1, Reason.EXCEEDS_PER_TRADE, abi.encode(100e18 + 1, 100e18));
    }

    function test_period_equalPasses_aboveBlocks() public {
        vm.prank(owner);
        registry.updateLimits(id, 300e18, 200e18, 7 days);
        _checkGold(200e18, Reason.OK, "");
        _checkGold(200e18 + 1, Reason.EXCEEDS_PERIOD, abi.encode(200e18 + 1, 0, 200e18));
    }

    function test_period_hugeAmountBlocksInsteadOfOverflow() public {
        vm.prank(owner);
        registry.updateLimits(id, type(uint256).max, 200e18, 7 days);
        _checkGold(type(uint256).max, Reason.EXCEEDS_PERIOD, abi.encode(type(uint256).max, 0, 200e18));
    }

    function test_stale_noData() public {
        address asset = makeAddr("noData");
        vm.prank(owner);
        registry.setAllowedAsset(id, asset, true);
        _check(agent, asset, venue, 50e18, Reason.RISK_DATA_STALE, abi.encode(uint8(0), uint64(0), NOW, uint64(900)));
    }

    function test_stale_ageLimitIsInclusive() public {
        vm.warp(NOW + 900);
        _checkGold(50e18, Reason.OK, "");
        vm.warp(NOW + 901);
        _checkGold(50e18, Reason.RISK_DATA_STALE, abi.encode(uint8(0), NOW, NOW + 901, uint64(900)));
    }

    function test_stale_oldSourceFreshPush() public {
        vm.warp(NOW + 901);
        RiskInput memory i;
        i.priceUsd = GOLD_PRICE;
        i.sourceTimestamp = NOW; // same old quote pushed again
        vm.prank(attester);
        oracle.update(address(gold), i);
        _checkGold(50e18, Reason.RISK_DATA_STALE, abi.encode(uint8(0), NOW, NOW + 901, uint64(900)));
    }

    function test_stale_futureSourceIsAgeZero() public {
        RiskInput memory i;
        i.priceUsd = GOLD_PRICE;
        i.sourceTimestamp = NOW + 200;
        vm.prank(attester);
        oracle.update(address(gold), i);
        _checkGold(50e18, Reason.OK, "");
    }

    function _divergence(uint32 limitPpm) internal {
        _allowEquity();
        vm.prank(owner);
        registry.setDivergenceBreaker(id, limitPpm);
    }

    function test_divergence_atLimitPasses_aboveBlocks() public {
        _divergence(10_000);
        _push(address(equity), 101e18, 0, 100e18, NOW);
        _checkEquity(Reason.OK, "");
        _push(address(equity), 101e18 + 1e14, 0, 100e18, NOW);
        _checkEquity(
            Reason.PRICE_DIVERGENCE, abi.encode(uint256(101e18 + 1e14), uint256(100e18), uint256(10_001), uint32(10_000))
        );
    }

    function test_divergence_belowAtlasAlsoBlocks() public {
        _divergence(10_000);
        _push(address(equity), 98e18, 0, 100e18, NOW);
        _checkEquity(
            Reason.PRICE_DIVERGENCE, abi.encode(uint256(98e18), uint256(100e18), uint256(20_000), uint32(10_000))
        );
    }

    function test_divergence_zeroDisables() public {
        _divergence(0);
        _push(address(equity), 200e18, 0, 100e18, NOW);
        _checkEquity(Reason.OK, "");
    }

    function test_divergence_ignoredWithoutSecondSource() public {
        vm.prank(owner);
        registry.setDivergenceBreaker(id, 1);
        _checkGold(50e18, Reason.OK, "");
    }

    function test_divergence_atlasOld() public {
        _divergence(10_000);
        vm.warp(NOW + 3600);
        _push(address(equity), EQUITY_PRICE, 0, 0, 0);
        _checkEquity(Reason.OK, "");
        vm.warp(NOW + 3601);
        _push(address(equity), EQUITY_PRICE, 0, 0, 0);
        _checkEquity(Reason.RISK_DATA_STALE, abi.encode(uint8(1), NOW, NOW + 3601, uint64(3600)));
    }

    function test_divergence_atlasMissing() public {
        _divergence(10_000);
        vm.startPrank(admin);
        oracle.setRequiresSecondSource(address(gold), true);
        vm.stopPrank();
        _checkGold(50e18, Reason.RISK_DATA_STALE, abi.encode(uint8(1), uint64(0), NOW, uint64(3600)));
    }

    function _volatility(uint32 limitPpm, int256 change1h) internal {
        vm.prank(owner);
        registry.setVolatilityBreaker(id, limitPpm);
        _push(address(gold), GOLD_PRICE, change1h, 0, 0);
    }

    function test_volatility_atLimitPasses_negativeMoveBlocks() public {
        _volatility(5000, -5000);
        _checkGold(50e18, Reason.OK, "");
        _volatility(5000, -5001);
        _checkGold(50e18, Reason.VOLATILITY_BREAKER, abi.encode(int256(-5001), uint32(5000)));
        _volatility(5000, 5001);
        _checkGold(50e18, Reason.VOLATILITY_BREAKER, abi.encode(int256(5001), uint32(5000)));
    }

    function test_volatility_subBps() public {
        _volatility(20, -40);
        _checkGold(50e18, Reason.VOLATILITY_BREAKER, abi.encode(int256(-40), uint32(20)));
    }

    function test_volatility_zeroDisables() public {
        _volatility(0, -500_000);
        _checkGold(50e18, Reason.OK, "");
    }

    function test_insufficientBalance() public {
        id = _createMandate(owner);
        _deposit(id, owner, 40e18);
        _checkGold(40e18, Reason.OK, "");
        _checkGold(40e18 + 1, Reason.INSUFFICIENT_BALANCE, abi.encode(uint256(40e18 + 1), uint256(40e18)));
    }

    function test_marketClosed_onlyIfRequired() public {
        _allowEquity();
        uint64 evening = NOW + 8 hours;
        vm.warp(evening);
        _push(address(equity), EQUITY_PRICE, 0, EQUITY_PRICE, evening);
        _push(address(gold), GOLD_PRICE, 0, 0, 0);
        _checkEquity(Reason.OK, "");
        vm.prank(owner);
        registry.setRequireMarketOpen(id, true);
        _checkEquity(Reason.UNDERLYING_MARKET_CLOSED, abi.encode(address(equity), evening));
        _checkGold(50e18, Reason.OK, ""); // no calendar
    }

    function test_order_firstFailureWins() public {
        _volatility(20, -40);
        _checkGold(150e18, Reason.EXCEEDS_PER_TRADE, abi.encode(uint256(150e18), uint256(100e18)));
        vm.prank(owner);
        registry.revoke(id);
        _checkGold(150e18, Reason.MANDATE_INACTIVE, "");
    }

    function test_zeroAmountReverts() public {
        vm.expectRevert(PolicyGuard.ZeroAmount.selector);
        guard.checkTrade(id, agent, address(gold), venue, 0);
    }

    function test_unknownMandateReverts() public {
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.UnknownMandate.selector, 99));
        guard.checkTrade(99, agent, address(gold), venue, 1);
    }

    function test_deposit_accountsAndEmits() public {
        deal(address(usd), owner, 10e18);
        vm.startPrank(owner);
        usd.approve(address(guard), 10e18);
        vm.expectEmit(address(guard));
        emit PolicyGuard.Deposited(id, 10e18);
        guard.deposit(id, 10e18);
        assertEq(guard.balanceOf(id), 310e18);
        assertEq(usd.balanceOf(address(guard)), 310e18);
    }

    function test_deposit_onlyOwner_nonZero() public {
        vm.prank(stranger);
        vm.expectRevert(PolicyGuard.NotOwner.selector);
        guard.deposit(id, 1);
        vm.prank(owner);
        vm.expectRevert(PolicyGuard.ZeroAmount.selector);
        guard.deposit(id, 0);
    }
}
