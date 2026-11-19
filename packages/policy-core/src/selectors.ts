import { parseAbi, toFunctionSelector } from "viem";

export const CARD_ABI = parseAbi([
  "function publishCard(string policyText, address guardian)",
  "function setGuardian(address newGuardian)",
  "function pause(address owner)",
  "function unpause()",
  "function submitAttestation(uint32 allowedCount, uint32 blockedEip712, uint32 blockedApprove, uint32 blockedSelector, uint32 blockedOther, bytes32 logMerkleRoot, uint64 periodStart, uint64 periodEnd)",
]);

export const TOKEN_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
]);

export const CARD_SELECTORS = {
  publishCard: toFunctionSelector("publishCard(string,address)"),
  setGuardian: toFunctionSelector("setGuardian(address)"),
  pause: toFunctionSelector("pause(address)"),
  unpause: toFunctionSelector("unpause()"),
  submitAttestation: toFunctionSelector("submitAttestation(uint32,uint32,uint32,uint32,uint32,bytes32,uint64,uint64)"),
} as const;

export const APPROVE_SELECTOR = toFunctionSelector("approve(address,uint256)");
export const SET_APPROVAL_FOR_ALL_SELECTOR = toFunctionSelector("setApprovalForAll(address,bool)");

/** Write commands of the wallet CLI that execute in one step (no preview/execute pair). */
export const ONE_STEP_COMMANDS: readonly string[] = [
  "wallet send",
  "market-order swap",
  "limit-order buy",
  "limit-order sell",
  "prediction trade place-order",
  "prediction trade redeem",
  "x402-payment sign",
  "defi deposit",
  "defi redeem",
  "defi lp-add",
  "defi lp-remove",
  "defi claim",
];
