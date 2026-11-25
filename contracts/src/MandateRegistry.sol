// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {Mandate, MandateParams} from "./Types.sol";

/// @title Mandate registry
/// @notice Owners define what their AI agent may do. Only the owner can change a mandate.
contract MandateRegistry {
    /// @notice ERC-8004 identity registry, address(0) switches identity checks off.
    IIdentityRegistry public immutable identityRegistry;

    uint256 public mandateCount;

    mapping(uint256 id => Mandate) private _mandates;
    mapping(uint256 id => mapping(address asset => bool)) private _allowed;
    mapping(address owner => uint256[]) private _byOwner;

    event MandateCreated(uint256 indexed mandateId, address indexed owner, address indexed agent);
    event MandateUpdated(uint256 indexed mandateId);
    event AllowedAssetSet(uint256 indexed mandateId, address indexed asset, bool allowed);
    event MandateRevoked(uint256 indexed mandateId);
    event MandateReactivated(uint256 indexed mandateId);

    error UnknownMandate(uint256 mandateId);
    error NotOwner();
    error InvalidParams();
    error IdentityMismatch();

    modifier onlyOwner(uint256 id) {
        address owner = _mandates[id].owner;
        if (owner == address(0)) revert UnknownMandate(id);
        if (owner != msg.sender) revert NotOwner();
        _;
    }

    constructor(address identityRegistry_) {
        identityRegistry = IIdentityRegistry(identityRegistry_);
    }

    function createMandate(MandateParams calldata p) external returns (uint256 id) {
        if (p.agent == address(0) || p.maxRiskAgeSeconds == 0) revert InvalidParams();
        if (p.expiresAt != 0 && p.expiresAt <= block.timestamp) revert InvalidParams();
        _checkLimits(p.maxPerTradeUsd, p.maxPerPeriodUsd, p.periodSeconds);
        _checkIdentity(p.agentRegistryId, p.agent);

        id = ++mandateCount;
        Mandate storage m = _mandates[id];
        m.owner = msg.sender;
        m.agent = p.agent;
        m.jurisdiction = p.jurisdiction;
        m.maxPerTradeUsd = p.maxPerTradeUsd;
        m.maxPerPeriodUsd = p.maxPerPeriodUsd;
        m.periodSeconds = p.periodSeconds;
        m.maxVolatilityPpm = p.maxVolatilityPpm;
        m.maxDivergencePpm = p.maxDivergencePpm;
        m.maxRiskAgeSeconds = p.maxRiskAgeSeconds;
        m.expiresAt = p.expiresAt;
        m.requireMarketOpen = p.requireMarketOpen;
        m.active = true;
        m.agentRegistryId = p.agentRegistryId;
        _byOwner[msg.sender].push(id);
        emit MandateCreated(id, msg.sender, p.agent);

        for (uint256 i; i < p.allowedAssets.length; ++i) {
            _setAllowed(id, p.allowedAssets[i], true);
        }
    }

    function updateLimits(uint256 id, uint256 maxPerTradeUsd, uint256 maxPerPeriodUsd, uint64 periodSeconds)
        external
        onlyOwner(id)
    {
        _checkLimits(maxPerTradeUsd, maxPerPeriodUsd, periodSeconds);
        Mandate storage m = _mandates[id];
        m.maxPerTradeUsd = maxPerTradeUsd;
        m.maxPerPeriodUsd = maxPerPeriodUsd;
        m.periodSeconds = periodSeconds;
        emit MandateUpdated(id);
    }

    function setAllowedAsset(uint256 id, address asset, bool allowed) external onlyOwner(id) {
        _setAllowed(id, asset, allowed);
        emit MandateUpdated(id);
    }

    function setJurisdiction(uint256 id, bytes2 jurisdiction) external onlyOwner(id) {
        _mandates[id].jurisdiction = jurisdiction;
        emit MandateUpdated(id);
    }

    function setVolatilityBreaker(uint256 id, uint32 maxVolatilityPpm) external onlyOwner(id) {
        _mandates[id].maxVolatilityPpm = maxVolatilityPpm;
        emit MandateUpdated(id);
    }

    function setDivergenceBreaker(uint256 id, uint32 maxDivergencePpm) external onlyOwner(id) {
        _mandates[id].maxDivergencePpm = maxDivergencePpm;
        emit MandateUpdated(id);
    }

    function setMaxRiskAge(uint256 id, uint64 maxRiskAgeSeconds) external onlyOwner(id) {
        if (maxRiskAgeSeconds == 0) revert InvalidParams();
        _mandates[id].maxRiskAgeSeconds = maxRiskAgeSeconds;
        emit MandateUpdated(id);
    }

    function setRequireMarketOpen(uint256 id, bool required) external onlyOwner(id) {
        _mandates[id].requireMarketOpen = required;
        emit MandateUpdated(id);
    }

    /// @notice Kill switch: every later trade attempt is blocked.
    function revoke(uint256 id) external onlyOwner(id) {
        _mandates[id].active = false;
        emit MandateRevoked(id);
    }

    function reactivate(uint256 id) external onlyOwner(id) {
        _mandates[id].active = true;
        emit MandateReactivated(id);
    }

    function getMandate(uint256 id) external view returns (Mandate memory m) {
        m = _mandates[id];
        if (m.owner == address(0)) revert UnknownMandate(id);
    }

    function isAssetAllowed(uint256 id, address asset) external view returns (bool) {
        return _allowed[id][asset];
    }

    function mandatesByOwner(address owner) external view returns (uint256[] memory) {
        return _byOwner[owner];
    }

    function _setAllowed(uint256 id, address asset, bool allowed) private {
        _allowed[id][asset] = allowed;
        emit AllowedAssetSet(id, asset, allowed);
    }

    function _checkLimits(uint256 maxPerTradeUsd, uint256 maxPerPeriodUsd, uint64 periodSeconds) private pure {
        if (maxPerTradeUsd == 0 || maxPerPeriodUsd == 0 || periodSeconds == 0) revert InvalidParams();
    }

    function _checkIdentity(uint256 agentRegistryId, address agent) private view {
        if (agentRegistryId == 0) return;
        if (address(identityRegistry) == address(0)) revert InvalidParams();
        if (identityRegistry.getAgentWallet(agentRegistryId) != agent) revert IdentityMismatch();
    }
}
