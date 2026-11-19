// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAgentID} from "./interfaces/IAgentID.sol";

/// @title AgentPolicyCard
/// @notice Public, self-declared rule card for agents whose wallet holds an Agent ID.
/// Ownerless: no admin, no proxy, not payable, never touches tokens.
contract AgentPolicyCard {
    IAgentID public immutable AGENT_ID;
    uint256 public constant MAX_POLICY_BYTES = 2048;

    struct PolicyCard {
        bytes32 policyHash; // keccak256(bytes(policyText)), computed on chain
        string policyText; // canonical JSON produced by the composer
        address guardian; // address(0) when none
        uint32 version; // 0 means no card yet
        bool paused;
        uint64 updatedAt;
        uint64 pausedAt;
    }

    struct Attestation {
        uint32 epoch; // increments per submission
        uint32 allowedCount;
        uint32 blockedEip712;
        uint32 blockedApprove;
        uint32 blockedSelector;
        uint32 blockedOther;
        bytes32 logMerkleRoot;
        uint64 periodStart;
        uint64 periodEnd;
        uint64 submittedAt;
    }

    mapping(address => PolicyCard) private cards;
    mapping(address => Attestation) private latest;

    event CardPublished(address indexed owner, uint32 indexed version, bytes32 policyHash, address guardian);
    event GuardianUpdated(address indexed owner, address indexed newGuardian);
    event AgentPaused(address indexed owner, address indexed triggeredBy, uint64 timestamp);
    event AgentUnpaused(address indexed owner, uint64 timestamp);
    event AttestationSubmitted(
        address indexed owner, uint32 indexed epoch, uint32 allowedCount, uint32 totalBlocked, bytes32 logMerkleRoot
    );

    error NotAgentIdHolder();
    error CardNotFound();
    error InvalidPolicyLength();
    error NotAuthorizedToPause();
    error AlreadyPaused();
    error NotPaused();
    error InvalidAttestationPeriod();
    error ZeroAgentId();

    constructor(address agentId) {
        if (agentId == address(0)) revert ZeroAgentId();
        AGENT_ID = IAgentID(agentId);
    }

    modifier onlyHolder() {
        if (AGENT_ID.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        _;
    }

    function publishCard(string calldata policyText, address guardian) external onlyHolder {
        uint256 len = bytes(policyText).length;
        if (len == 0 || len > MAX_POLICY_BYTES) revert InvalidPolicyLength();
        PolicyCard storage c = cards[msg.sender];
        bytes32 h = keccak256(bytes(policyText));
        c.policyHash = h;
        c.policyText = policyText;
        c.guardian = guardian;
        c.version += 1;
        c.updatedAt = uint64(block.timestamp);
        emit CardPublished(msg.sender, c.version, h, guardian);
    }

    function setGuardian(address newGuardian) external onlyHolder {
        PolicyCard storage c = cards[msg.sender];
        if (c.version == 0) revert CardNotFound();
        c.guardian = newGuardian;
        c.updatedAt = uint64(block.timestamp);
        emit GuardianUpdated(msg.sender, newGuardian);
    }

    function pause(address) external pure {
        revert();
    }

    function unpause() external pure {
        revert();
    }

    function submitAttestation(uint32, uint32, uint32, uint32, uint32, bytes32, uint64, uint64) external pure {
        revert();
    }

    function getCard(address owner) external view returns (PolicyCard memory) {
        return cards[owner];
    }

    function isPaused(address owner) external view returns (bool) {
        return cards[owner].paused;
    }

    function getLatestAttestation(address owner) external view returns (Attestation memory) {
        return latest[owner];
    }
}
