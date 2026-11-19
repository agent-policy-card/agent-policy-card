// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentPolicyCard} from "../src/AgentPolicyCard.sol";
import {MockAgentID} from "./mocks/MockAgentID.sol";

/// Gas of publishing the default preset (canonical text copied from policy-core).
contract GasTest is Test {
    function test_gas_publishDefaultPreset() public {
        MockAgentID id = new MockAgentID();
        address holder = makeAddr("holder");
        id.setBalance(holder, 1);
        AgentPolicyCard card = new AgentPolicyCard(address(id));
        string memory text = '{"profile":"eip712-shield","rules":{"allowedContracts":[],"blockAuthorityChanges":true,"blockOnBinanceRisk":true,"blockSetApprovalForAll":true,"blockUnlimitedApprove":true,"deniedSelectors":[],"eip712":{"allow":[],"mode":"allowlist"},"maxNativeValueWei":"10000000000000000","oneStep":{"allow":["wallet send","market-order swap"]},"unknownCommand":"block"},"v":1}';
        vm.prank(holder);
        uint256 before = gasleft();
        card.publishCard(text, address(0));
        emit log_named_uint("publishCard eip712-shield gas", before - gasleft());
    }
}
