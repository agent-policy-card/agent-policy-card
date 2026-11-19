// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentPolicyCard} from "../src/AgentPolicyCard.sol";

/// Deploys AgentPolicyCard. Run by the deployer with their own keystore, for example:
/// AGENT_ID=0x60b9262456de011f7d15a54cdd8c48baaa8b022f forge script script/Deploy.s.sol \
///   --rpc-url bsc --account <keystore-name> --broadcast --verify
contract Deploy is Script {
    function run() external returns (AgentPolicyCard card) {
        address agentId = vm.envAddress("AGENT_ID");
        vm.startBroadcast();
        card = new AgentPolicyCard(agentId);
        vm.stopBroadcast();
        console2.log("AgentPolicyCard deployed at", address(card));
        console2.log("block", block.number);
    }
}
