import { CARD_ABI, canonicalize } from "@apc/policy-core";
import type { PolicyV1 } from "@apc/policy-core";
import { encodeFunctionData, zeroAddress } from "viem";
import type { Hex } from "viem";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_POLICY_BYTES = 2048;

export function buildPublishCalldata(policy: PolicyV1, guardian: string | null): Hex {
  if (guardian !== null && !ADDRESS_RE.test(guardian)) {
    throw new Error("Guardian must be a 0x address with 40 hex characters");
  }
  if (policy.profile === "strict-allowlist" && policy.rules.allowedContracts.length === 0) {
    throw new Error("strict-allowlist needs at least one allowed contract address");
  }
  for (const a of policy.rules.allowedContracts) {
    if (!ADDRESS_RE.test(a)) throw new Error(`Invalid contract address: ${a}`);
  }
  const text = canonicalize(policy);
  if (new TextEncoder().encode(text).length > MAX_POLICY_BYTES) {
    throw new Error(`Policy is longer than ${MAX_POLICY_BYTES} bytes`);
  }
  return encodeFunctionData({
    abi: CARD_ABI,
    functionName: "publishCard",
    args: [text, (guardian ?? zeroAddress) as Hex],
  });
}

export function buildAgentPrompt(cardContract: string, calldata: Hex): string {
  return [
    "Publish my Agent Policy Card on BNB Chain.",
    `Run: baw contract-call preview --binanceChainId 56 --from <MY_AGENTIC_WALLET> --to ${cardContract} --value 0 --inputData ${calldata} --json`,
    'Show me the parsed transaction and risks, then wait for my explicit "yes" before running contract-call execute.',
  ].join("\n");
}

/** Prompt for an in-app assistant (Binance AI Pro) that drives the Agentic Wallet without CLI syntax. */
export function buildAiProPrompt(cardContract: string, calldata: Hex): string {
  return [
    "Publish my Agent Policy Card from my Agentic Wallet on BNB Smart Chain (chain id 56).",
    `Make one contract call to ${cardContract} with value 0 and this input data:`,
    calldata,
    'First show me the preview: the contract, the parsed transaction and any risks. Then wait for my explicit "yes" before you send it. Do not approve any token and do not send any other transaction.',
  ].join("\n");
}
