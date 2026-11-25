// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Outcome of a policy check. Checks run in this order, the first failure wins.
enum Reason {
    OK, // 0
    NOT_AGENT, // 1 caller is not the mandate's agent
    MANDATE_INACTIVE, // 2 revoked by the owner
    MANDATE_EXPIRED, // 3
    ASSET_NOT_ALLOWED, // 4 not in the mandate's asset list
    JURISDICTION_RESTRICTED, // 5 asset is restricted for the owner's jurisdiction
    VENUE_DENIED, // 6 venue is not approved, or is on the denylist
    EXCEEDS_PER_TRADE, // 7
    EXCEEDS_PERIOD, // 8 fixed-window cap
    RISK_DATA_STALE, // 9 price data missing or too old
    PRICE_DIVERGENCE, // 10 CMC and Atlas disagree by more than the mandate allows
    VOLATILITY_BREAKER, // 11 1h move larger than the mandate allows
    INSUFFICIENT_BALANCE, // 12
    UNDERLYING_MARKET_CLOSED // 13
}

/// @notice Latest market data for an asset. Prices use 1e18, moves use ppm (1% = 10,000).
struct RiskData {
    uint256 priceUsd; // CoinMarketCap price
    int256 change1hPpm;
    int256 change24hPpm;
    uint64 updatedAt; // block time of the last update
    uint64 sourceTimestamp; // CoinMarketCap last_updated, unix seconds
    uint256 atlasPriceUsd; // Atlas price, 0 if the asset has no Atlas feed
    uint64 atlasTimestamp; // Atlas on-chain timestamp, unix seconds
}

/// @notice What the attester submits. `updatedAt` is set by the contract.
struct RiskInput {
    uint256 priceUsd;
    int256 change1hPpm;
    int256 change24hPpm;
    uint64 sourceTimestamp;
    uint256 atlasPriceUsd;
    uint64 atlasTimestamp;
}
