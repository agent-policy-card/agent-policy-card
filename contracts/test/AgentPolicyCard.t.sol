// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyCard} from "../src/AgentPolicyCard.sol";
import {MockAgentID} from "./mocks/MockAgentID.sol";

contract AgentPolicyCardTest is Test {
    event CardPublished(address indexed owner, uint32 indexed version, bytes32 policyHash, address guardian);
    event GuardianUpdated(address indexed owner, address indexed newGuardian);
    event AgentPaused(address indexed owner, address indexed triggeredBy, uint64 timestamp);
    event AgentUnpaused(address indexed owner, uint64 timestamp);
    event AttestationSubmitted(
        address indexed owner, uint32 indexed epoch, uint32 allowedCount, uint32 totalBlocked, bytes32 logMerkleRoot
    );

    MockAgentID internal agentId;
    AgentPolicyCard internal card;

    address internal holder = makeAddr("holder");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");

    string internal constant POLICY = '{"v":1}';

    function setUp() public {
        vm.warp(1_800_000_000);
        agentId = new MockAgentID();
        agentId.setBalance(holder, 1);
        card = new AgentPolicyCard(address(agentId));
    }

    function _publish() internal {
        vm.prank(holder);
        card.publishCard(POLICY, guardian);
    }

    function _repeat(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; i++) b[i] = "a";
        return string(b);
    }

    // ---------- constructor ----------

    function test_constructor_revertsOnZeroAgentId() public {
        vm.expectRevert(AgentPolicyCard.ZeroAgentId.selector);
        new AgentPolicyCard(address(0));
    }

    function test_constructor_setsAgentId() public view {
        assertEq(address(card.AGENT_ID()), address(agentId));
    }

    // ---------- publishCard ----------

    function test_publish_revertsWithoutAgentId() public {
        vm.prank(stranger);
        vm.expectRevert(AgentPolicyCard.NotAgentIdHolder.selector);
        card.publishCard("{}", address(0));
    }

    function test_publish_firstCard() public {
        bytes32 h = keccak256(bytes(POLICY));
        vm.expectEmit(true, true, false, true, address(card));
        emit CardPublished(holder, 1, h, guardian);
        _publish();

        AgentPolicyCard.PolicyCard memory c = card.getCard(holder);
        assertEq(c.version, 1);
        assertEq(c.policyHash, h);
        assertEq(c.policyText, POLICY);
        assertEq(c.guardian, guardian);
        assertFalse(c.paused);
        assertEq(c.updatedAt, block.timestamp);
    }

    function test_publish_updateIncrementsVersion() public {
        _publish();
        vm.prank(holder);
        card.publishCard('{"v":1,"x":2}', address(0));
        AgentPolicyCard.PolicyCard memory c = card.getCard(holder);
        assertEq(c.version, 2);
        assertEq(c.guardian, address(0));
        assertEq(c.policyHash, keccak256(bytes('{"v":1,"x":2}')));
    }

    function test_publish_rejectsEmpty() public {
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.InvalidPolicyLength.selector);
        card.publishCard("", address(0));
    }

    function test_publish_rejectsOversize() public {
        string memory big = _repeat(2049);
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.InvalidPolicyLength.selector);
        card.publishCard(big, address(0));
    }

    function test_publish_acceptsMaxSize() public {
        string memory max = _repeat(2048);
        vm.prank(holder);
        card.publishCard(max, address(0));
        assertEq(card.getCard(holder).version, 1);
    }

    // ---------- setGuardian ----------

    function test_setGuardian_requiresCard() public {
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.CardNotFound.selector);
        card.setGuardian(guardian);
    }

    function test_setGuardian_updatesAndEmits() public {
        _publish();
        address g2 = makeAddr("g2");
        vm.expectEmit(true, true, false, false, address(card));
        emit GuardianUpdated(holder, g2);
        vm.prank(holder);
        card.setGuardian(g2);
        assertEq(card.getCard(holder).guardian, g2);
    }

    function test_setGuardian_requiresAgentId() public {
        _publish();
        agentId.setBalance(holder, 0);
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.NotAgentIdHolder.selector);
        card.setGuardian(address(0));
    }

    // ---------- pause / unpause ----------

    function test_pause_byOwner() public {
        _publish();
        vm.expectEmit(true, true, false, true, address(card));
        emit AgentPaused(holder, holder, uint64(block.timestamp));
        vm.prank(holder);
        card.pause(holder);
        assertTrue(card.isPaused(holder));
        assertEq(card.getCard(holder).pausedAt, block.timestamp);
    }

    function test_pause_byGuardian() public {
        _publish();
        vm.expectEmit(true, true, false, true, address(card));
        emit AgentPaused(holder, guardian, uint64(block.timestamp));
        vm.prank(guardian);
        card.pause(holder);
        assertTrue(card.isPaused(holder));
    }

    function test_pause_byStrangerReverts() public {
        _publish();
        vm.prank(stranger);
        vm.expectRevert(AgentPolicyCard.NotAuthorizedToPause.selector);
        card.pause(holder);
    }

    function test_pause_zeroGuardianDoesNotAuthorizeZeroCaller() public {
        vm.prank(holder);
        card.publishCard(POLICY, address(0));
        vm.prank(stranger);
        vm.expectRevert(AgentPolicyCard.NotAuthorizedToPause.selector);
        card.pause(holder);
    }

    function test_pause_noCardReverts() public {
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.CardNotFound.selector);
        card.pause(holder);
    }

    function test_pause_twiceReverts() public {
        _publish();
        vm.prank(holder);
        card.pause(holder);
        vm.prank(guardian);
        vm.expectRevert(AgentPolicyCard.AlreadyPaused.selector);
        card.pause(holder);
    }

    function test_pause_ownerWithoutAgentIdStillAllowed() public {
        _publish();
        agentId.setBalance(holder, 0);
        vm.prank(holder);
        card.pause(holder);
        assertTrue(card.isPaused(holder));
    }

    function test_publish_whilePausedKeepsPaused() public {
        _publish();
        vm.prank(holder);
        card.pause(holder);
        vm.prank(holder);
        card.publishCard('{"v":1,"y":1}', guardian);
        assertTrue(card.isPaused(holder));
        assertEq(card.getCard(holder).version, 2);
    }

    function test_setGuardian_allowedWhilePaused() public {
        _publish();
        vm.prank(guardian);
        card.pause(holder);
        vm.prank(holder);
        card.setGuardian(address(0));
        assertEq(card.getCard(holder).guardian, address(0));
        assertTrue(card.isPaused(holder));
    }

    function test_unpause_byOwner() public {
        _publish();
        vm.prank(guardian);
        card.pause(holder);
        vm.expectEmit(true, false, false, true, address(card));
        emit AgentUnpaused(holder, uint64(block.timestamp));
        vm.prank(holder);
        card.unpause();
        assertFalse(card.isPaused(holder));
    }

    function test_unpause_guardianCannotUnpauseOwner() public {
        _publish();
        vm.prank(holder);
        card.pause(holder);
        agentId.setBalance(guardian, 1);
        vm.prank(guardian);
        vm.expectRevert(AgentPolicyCard.CardNotFound.selector);
        card.unpause();
        assertTrue(card.isPaused(holder));
    }

    function test_unpause_notPausedReverts() public {
        _publish();
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.NotPaused.selector);
        card.unpause();
    }

    function test_unpause_requiresAgentId() public {
        _publish();
        vm.prank(holder);
        card.pause(holder);
        agentId.setBalance(holder, 0);
        vm.prank(holder);
        vm.expectRevert(AgentPolicyCard.NotAgentIdHolder.selector);
        card.unpause();
    }

    // ---------- attestations ----------

    function _attest(uint64 start, uint64 end) internal {
        vm.prank(holder);
        card.submitAttestation(3, 1, 1, 0, 0, bytes32(uint256(7)), start, end);
    }

    function test_attest_happyPath() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        vm.expectEmit(true, true, false, true, address(card));
        emit AttestationSubmitted(holder, 1, 3, 2, bytes32(uint256(7)));
        _attest(t - 100, t - 10);
        AgentPolicyCard.Attestation memory a = card.getLatestAttestation(holder);
        assertEq(a.epoch, 1);
        assertEq(a.allowedCount, 3);
        assertEq(a.blockedEip712, 1);
        assertEq(a.blockedApprove, 1);
        assertEq(a.logMerkleRoot, bytes32(uint256(7)));
        assertEq(a.periodStart, t - 100);
        assertEq(a.periodEnd, t - 10);
        assertEq(a.submittedAt, t);
    }

    function test_attest_secondEpochContinues() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        _attest(t - 100, t - 50);
        _attest(t - 50, t);
        assertEq(card.getLatestAttestation(holder).epoch, 2);
    }

    function test_attest_rejectsStartNotBeforeEnd() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(AgentPolicyCard.InvalidAttestationPeriod.selector);
        _attest(t - 10, t - 10);
    }

    function test_attest_rejectsFutureEnd() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(AgentPolicyCard.InvalidAttestationPeriod.selector);
        _attest(t - 10, t + 1);
    }

    function test_attest_rejectsMillisecondEnd() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(AgentPolicyCard.InvalidAttestationPeriod.selector);
        _attest(t - 10, t * 1000);
    }

    function test_attest_rejectsOverlapWithPrevious() public {
        _publish();
        uint64 t = uint64(block.timestamp);
        _attest(t - 100, t - 50);
        vm.expectRevert(AgentPolicyCard.InvalidAttestationPeriod.selector);
        _attest(t - 60, t);
    }

    function test_attest_requiresCard() public {
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(AgentPolicyCard.CardNotFound.selector);
        _attest(t - 100, t - 10);
    }

    function test_attest_requiresAgentId() public {
        _publish();
        agentId.setBalance(holder, 0);
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(AgentPolicyCard.NotAgentIdHolder.selector);
        _attest(t - 100, t - 10);
    }

    function test_attest_allowedWhilePaused() public {
        _publish();
        vm.prank(holder);
        card.pause(holder);
        uint64 t = uint64(block.timestamp);
        _attest(t - 100, t - 10);
        assertEq(card.getLatestAttestation(holder).epoch, 1);
    }

    // ---------- views ----------

    function test_getCard_emptyForUnknown() public view {
        AgentPolicyCard.PolicyCard memory c = card.getCard(stranger);
        assertEq(c.version, 0);
        assertFalse(card.isPaused(stranger));
        assertEq(card.getLatestAttestation(stranger).epoch, 0);
    }
}
