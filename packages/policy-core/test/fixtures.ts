// Test-only builders for wallet preview JSON and intents. Shapes follow the official
// external-sign reference (contract-call and sign-message preview responses).
import { encodeFunctionData, maxUint256, parseAbi } from "viem";
import { canonicalize } from "../src/schema.js";
import { PRESETS } from "../src/presets.js";
import type { PolicyV1 } from "../src/types.js";
import type { ChainState } from "../src/evaluate.js";

export const CARD = "0x2222222222222222222222222222222222222222";
export const WALLET = "0x1111111111111111111111111111111111111111";
export const TOKEN = "0x3333333333333333333333333333333333333333";
export const SPENDER = "0x4444444444444444444444444444444444444444";
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const erc = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transfer(address to, uint256 amount)",
]);
const cardAbi = parseAbi([
  "function publishCard(string policyText, address guardian)",
  "function setGuardian(address newGuardian)",
  "function pause(address owner)",
  "function unpause()",
  "function submitAttestation(uint32 allowedCount, uint32 blockedEip712, uint32 blockedApprove, uint32 blockedSelector, uint32 blockedOther, bytes32 logMerkleRoot, uint64 periodStart, uint64 periodEnd)",
]);

export const calldata = {
  approve: (amount: bigint) => encodeFunctionData({ abi: erc, functionName: "approve", args: [SPENDER, amount] }),
  approveMax: () => encodeFunctionData({ abi: erc, functionName: "approve", args: [SPENDER, maxUint256] }),
  setApprovalForAll: (on: boolean) =>
    encodeFunctionData({ abi: erc, functionName: "setApprovalForAll", args: [SPENDER, on] }),
  transfer: () => encodeFunctionData({ abi: erc, functionName: "transfer", args: [SPENDER, 1n] }),
  publishCard: () =>
    encodeFunctionData({ abi: cardAbi, functionName: "publishCard", args: ['{"v":1}', WALLET] }),
  setGuardian: () => encodeFunctionData({ abi: cardAbi, functionName: "setGuardian", args: [SPENDER] }),
  pause: () => encodeFunctionData({ abi: cardAbi, functionName: "pause", args: [WALLET] }),
  unpause: () => encodeFunctionData({ abi: cardAbi, functionName: "unpause" }),
  submitAttestation: () =>
    encodeFunctionData({
      abi: cardAbi,
      functionName: "submitAttestation",
      args: [1, 0, 0, 0, 0, `0x${"ab".repeat(32)}`, 1n, 2n],
    }),
};

type RiskItem = { code: string; title: string; description: string; riskType: "RISK" | "CAUTION"; order: number };

export function risk(riskType: "RISK" | "CAUTION"): RiskItem {
  return { code: "R1", title: "t", description: "d", riskType, order: 1 };
}

export function contractPreview(opts: {
  allowanceChanges?: unknown[];
  authorityChanges?: unknown[];
  riskDetails?: RiskItem[];
  addresses?: Record<string, { riskLevel: number; riskDetails: RiskItem[] }>;
} = {}): unknown {
  return {
    success: true,
    data: {
      requestId: "req-1",
      parsedTx: { transactionType: "ContractCall", amount: 0, isMax: false, recipient: TOKEN, contractAddress: TOKEN, memo: null },
      simulationResult: {
        simulationCode: "000000000",
        simulationErrorDetail: null,
        gasTokenFromData: 1,
        balanceChanges: [],
        allowanceChanges: opts.allowanceChanges ?? [],
        authorityChanges: opts.authorityChanges ?? [],
        preCheckCode: "",
      },
      risks: { riskDetails: opts.riskDetails ?? [], addresses: opts.addresses ?? {}, riskBehaviors: [] },
      requireConfirmation: false,
      expiresAt: 1784037104410,
    },
  };
}

export function signPreview(parsedExtra: Record<string, unknown> = {}, riskDetails: RiskItem[] = []): unknown {
  return {
    success: true,
    data: {
      requestId: "req-2",
      parsedMessage: { messageType: "SignTypedData", preCheckCode: "", version: "V4", message: "{}", ...parsedExtra },
      risks: { riskDetails, addresses: {}, riskBehaviors: [] },
      requireConfirmation: false,
      expiresAt: 1784037104410,
    },
  };
}

export function contractArgs(to: string, inputData: string, value = "0", chain = "56"): Record<string, string> {
  return { binanceChainId: chain, from: WALLET, to, value, inputData };
}

export function typedData(opts: { name: string; chainId?: number | string; verifyingContract: string; primaryType: string; message?: object }): object {
  const domain: Record<string, unknown> = { name: opts.name, verifyingContract: opts.verifyingContract };
  if (opts.chainId !== undefined) domain.chainId = opts.chainId;
  return { domain, primaryType: opts.primaryType, types: {}, message: opts.message ?? { contents: "hello" } };
}

export function signArgs(td: object, chain = "56"): Record<string, string> {
  return {
    binanceChainId: chain,
    signType: "EIP712",
    message: JSON.stringify({ method: "eth_signTypedData_v4", params: [WALLET, JSON.stringify(td)] }),
  };
}

export const PERMIT_TD = typedData({ name: "USD Coin", chainId: 56, verifyingContract: TOKEN, primaryType: "Permit", message: { owner: WALLET, spender: SPENDER, value: "1" } });

export function chainWith(policy: PolicyV1 | string = PRESETS["eip712-shield"], extra: { paused?: boolean; version?: number } = {}): ChainState {
  const policyText = typeof policy === "string" ? policy : canonicalize(policy);
  return { ok: true, card: { version: extra.version ?? 1, paused: extra.paused ?? false, policyText } };
}

export const NO_CARD: ChainState = { ok: true, card: null };
export const CHAIN_DOWN: ChainState = { ok: false };

export function withPolicy(mut: (p: PolicyV1) => void): PolicyV1 {
  const p = structuredClone(PRESETS["eip712-shield"]);
  mut(p);
  return p;
}
