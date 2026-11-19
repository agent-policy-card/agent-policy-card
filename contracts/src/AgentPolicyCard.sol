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

    /// @notice Pause an agent. Callable by the card owner or its guardian. Not gated on
    /// Agent ID: pausing is defensive and must keep working.
    function pause(address owner) external {
        PolicyCard storage c = cards[owner];
        if (c.version == 0) revert CardNotFound();
        if (msg.sender != owner && (c.guardian == address(0) || msg.sender != c.guardian)) {
            revert NotAuthorizedToPause();
        }
        if (c.paused) revert AlreadyPaused();
        c.paused = true;
        c.pausedAt = uint64(block.timestamp);
        emit AgentPaused(owner, msg.sender, uint64(block.timestamp));
    }

    /// @notice Unpause the caller's own card. Guardians cannot unpause.
    function unpause() external onlyHolder {
        PolicyCard storage c = cards[msg.sender];
        if (c.version == 0) revert CardNotFound();
        if (!c.paused) revert NotPaused();
        c.paused = false;
        emit AgentUnpaused(msg.sender, uint64(block.timestamp));
    }

    /// @notice Anchor a period summary and the Merkle root of the local audit log.
    /// Periods are Unix seconds, never in the future, and never overlap the previous one.
    function submitAttestation(
        uint32 allowedCount,
        uint32 blockedEip712,
        uint32 blockedApprove,
        uint32 blockedSelector,
        uint32 blockedOther,
        bytes32 logMerkleRoot,
        uint64 periodStart,
        uint64 periodEnd
    ) external onlyHolder {
        if (cards[msg.sender].version == 0) revert CardNotFound();
        Attestation storage a = latest[msg.sender];
        if (periodStart >= periodEnd || periodEnd > block.timestamp || periodStart < a.periodEnd) {
            revert InvalidAttestationPeriod();
        }
        a.epoch += 1;
        a.allowedCount = allowedCount;
        a.blockedEip712 = blockedEip712;
        a.blockedApprove = blockedApprove;
        a.blockedSelector = blockedSelector;
        a.blockedOther = blockedOther;
        a.logMerkleRoot = logMerkleRoot;
        a.periodStart = periodStart;
        a.periodEnd = periodEnd;
        a.submittedAt = uint64(block.timestamp);
        uint32 totalBlocked = blockedEip712 + blockedApprove + blockedSelector + blockedOther;
        emit AttestationSubmitted(msg.sender, a.epoch, allowedCount, totalBlocked, logMerkleRoot);
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
