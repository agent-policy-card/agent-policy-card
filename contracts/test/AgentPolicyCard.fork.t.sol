// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AgentPolicyCard} from "../src/AgentPolicyCard.sol";
import {IAgentID} from "../src/interfaces/IAgentID.sol";

/// Fork test against the real Agent ID contract on BSC mainnet.
/// Run with: BSC_RPC_URL=<rpc> forge test --match-path "*fork*" -vv
contract AgentPolicyCardForkTest is Test {
    address internal constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    bytes32 internal constant TRANSFER_TOPIC = keccak256("Transfer(address,address,uint256)");

    AgentPolicyCard internal card;

    function setUp() public {
        vm.createSelectFork(vm.envString("BSC_RPC_URL"));
        card = new AgentPolicyCard(AGENT_ID);
    }

    function testFork_nonHolderIsRejected() public {
        address nobody = makeAddr("nobody");
        assertEq(IAgentID(AGENT_ID).balanceOf(nobody), 0);
        vm.prank(nobody);
        vm.expectRevert(AgentPolicyCard.NotAgentIdHolder.selector);
        card.publishCard('{"v":1}', address(0));
    }

    /// Finds a current holder from recent mint events instead of hard-coding any address.
    function testFork_realHolderCanPublish() public {
        address holder = _findHolder();
        vm.prank(holder);
        card.publishCard('{"v":1}', address(0));
        assertEq(card.getCard(holder).version, 1);
    }

    function _findHolder() internal returns (address) {
        uint256 head = block.number;
        for (uint256 back = 0; back < 200_000; back += 5_000) {
            uint256 to = head - back;
            uint256 from = to - 5_000 + 1;
            Vm.EthGetLogs[] memory logs = vm.eth_getLogs(from, to, AGENT_ID, _topics());
            for (uint256 i = logs.length; i > 0; i--) {
                if (logs[i - 1].topics.length < 3) continue;
                address candidate = address(uint160(uint256(logs[i - 1].topics[2])));
                if (candidate != address(0) && IAgentID(AGENT_ID).balanceOf(candidate) > 0) return candidate;
            }
        }
        revert("no Agent ID holder found in the scanned range");
    }

    function _topics() internal pure returns (bytes32[] memory t) {
        t = new bytes32[](1);
        t[0] = TRANSFER_TOPIC;
    }
}
