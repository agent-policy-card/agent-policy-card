// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAgentID} from "../../src/interfaces/IAgentID.sol";

contract MockAgentID is IAgentID {
    mapping(address => uint256) private balances;

    function setBalance(address owner, uint256 amount) external {
        balances[owner] = amount;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return balances[owner];
    }
}
