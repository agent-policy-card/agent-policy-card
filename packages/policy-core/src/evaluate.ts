// Fail-closed policy evaluation. Pure: no I/O, runs in Node and in the browser.
// The returned verdict never instructs anyone to sign automatically or to skip
// the wallet's own confirmation step.
import { decodeFunctionData, keccak256, stringToBytes } from "viem";
import type { Intent, TypedDataInfo } from "./intent.js";
import { parsePolicy } from "./schema.js";
import { APPROVE_SELECTOR, CARD_ABI, CARD_SELECTORS, SET_APPROVAL_FOR_ALL_SELECTOR, TOKEN_ABI } from "./selectors.js";
import type { PolicyV1 } from "./types.js";

export { toIntent } from "./intent.js";
export type { Intent, TypedDataInfo } from "./intent.js";

export type Verdict = "ALLOW_FOR_PREVIEW" | "BLOCK" | "PENDING_HUMAN_CONFIRM";
export type ReasonCode =
  | "OK"
  | "CARD_CHANGE_NEEDS_HUMAN"
  | "UNSUPPORTED_CHAIN"
  | "NO_CARD"
  | "AGENT_PAUSED"
  | "POLICY_UNREADABLE"
  | "UNKNOWN_COMMAND"
  | "BLOCKED_COMMAND"
  | "BLOCKED_EIP712"
  | "BLOCKED_APPROVE"
  | "BLOCKED_BINANCE_RISK"
  | "BLOCKED_SELECTOR"
  | "BLOCKED_OTHER"
  | "MALFORMED_PREVIEW"
  | "CHAIN_READ_FAILED";
export type AttestBucket = "allowed" | "eip712" | "approve" | "selector" | "other" | "none";
export type Decision = { verdict: Verdict; reasonCode: ReasonCode; bucket: AttestBucket; cardCall: boolean; summary?: string };

export type ChainState =
  | { ok: true; card: { version: number; paused: boolean; policyText: string } | null }
  | { ok: false };

export const SUPPORTED_CHAIN_ID = 56;
/** Approvals at or above this amount count as unlimited. */
export const UNLIMITED_APPROVE_THRESHOLD = 2n ** 128n;

const BUCKET: Record<ReasonCode, AttestBucket> = {
  OK: "allowed",
  CARD_CHANGE_NEEDS_HUMAN: "none",
  UNSUPPORTED_CHAIN: "other",
  NO_CARD: "other",
  AGENT_PAUSED: "other",
  POLICY_UNREADABLE: "other",
  UNKNOWN_COMMAND: "other",
  BLOCKED_COMMAND: "other",
  BLOCKED_EIP712: "eip712",
  BLOCKED_APPROVE: "approve",
  BLOCKED_BINANCE_RISK: "other",
  BLOCKED_SELECTOR: "selector",
  BLOCKED_OTHER: "other",
  MALFORMED_PREVIEW: "other",
  CHAIN_READ_FAILED: "other",
};

function block(reasonCode: ReasonCode, cardCall = false): Decision {
  return { verdict: "BLOCK", reasonCode, bucket: BUCKET[reasonCode], cardCall };
}

function allow(cardCall = false): Decision {
  return { verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", bucket: "allowed", cardCall };
}

function pending(summary: string): Decision {
  return { verdict: "PENDING_HUMAN_CONFIRM", reasonCode: "CARD_CHANGE_NEEDS_HUMAN", bucket: "none", cardCall: true, summary };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const lower = (s: string) => s.toLowerCase();

// ---------- preview shape checks (missing field = malformed, never "empty") ----------

type RiskItem = { riskType?: unknown };
type Risks = { riskDetails: RiskItem[]; addresses: Record<string, { riskDetails: RiskItem[] }> };

function validRiskItems(items: unknown): boolean {
  return Array.isArray(items) && items.every((r) => isObject(r) && (r.riskType === "RISK" || r.riskType === "CAUTION"));
}

function readRisks(v: unknown): Risks | null {
  if (!isObject(v) || !validRiskItems(v.riskDetails) || !isObject(v.addresses)) return null;
  for (const entry of Object.values(v.addresses)) {
    if (!isObject(entry) || !validRiskItems(entry.riskDetails)) return null;
  }
  return v as unknown as Risks;
}

function previewData(preview: unknown): Record<string, unknown> | null {
  if (!isObject(preview) || preview.success !== true || !isObject(preview.data)) return null;
  const id = preview.data.requestId;
  return typeof id === "string" && id.length > 0 ? preview.data : null;
}

type ContractPreview = { allowanceChanges: unknown[]; authorityChanges: unknown[]; risks: Risks };
function readContractPreview(preview: unknown): ContractPreview | null {
  const data = previewData(preview);
  if (data === null || !isObject(data.simulationResult) || !isObject(data.parsedTx)) return null;
  const sim = data.simulationResult;
  if (sim.simulationCode !== "000000000") return null;
  if (!Array.isArray(sim.allowanceChanges) || !Array.isArray(sim.authorityChanges)) return null;
  const risks = readRisks(data.risks);
  if (risks === null) return null;
  return { allowanceChanges: sim.allowanceChanges, authorityChanges: sim.authorityChanges, risks };
}

type SignPreview = { parsedMessage: Record<string, unknown>; risks: Risks };
function readSignPreview(preview: unknown): SignPreview | null {
  const data = previewData(preview);
  if (data === null || !isObject(data.parsedMessage) || data.parsedMessage.messageType !== "SignTypedData") return null;
  const risks = readRisks(data.risks);
  return risks === null ? null : { parsedMessage: data.parsedMessage, risks };
}

function hasRisk(risks: Risks): boolean {
  if (risks.riskDetails.some((r) => isObject(r) && r.riskType === "RISK")) return true;
  return Object.values(risks.addresses).some((a) => a.riskDetails.some((r) => isObject(r) && r.riskType === "RISK"));
}

// ---------- step 0: the card contract itself ----------

function selectorOf(inputData: string): string {
  return inputData.length >= 10 ? lower(inputData.slice(0, 10)) : "";
}

function evaluateCardCall(intent: Extract<Intent, { kind: "contractCall" }>, chain: ChainState): Decision {
  if (previewData(intent.preview) === null) return block("MALFORMED_PREVIEW", true);
  if (intent.valueWei !== 0n) return block("BLOCKED_OTHER", true);
  const sel = selectorOf(intent.inputData);
  const known = Object.values(CARD_SELECTORS) as string[];
  if (!known.includes(sel)) return block("BLOCKED_OTHER", true);
  // Throws on calldata that does not decode; the caller turns that into a block.
  const { args: decoded } = decodeFunctionData({ abi: CARD_ABI, data: intent.inputData as `0x${string}` });
  if (sel === CARD_SELECTORS.pause || sel === CARD_SELECTORS.submitAttestation) return allow(true);
  if (sel === CARD_SELECTORS.unpause) return pending("unpause the agent card");
  if (sel === CARD_SELECTORS.setGuardian) {
    return pending(`setGuardian to ${lower(String(decoded?.[0]))}`);
  }
  if (sel === CARD_SELECTORS.publishCard) {
    if (chain.ok && chain.card === null) return allow(true);
    const text = String(decoded?.[0] ?? "");
    const parsedNew = parsePolicy(text);
    const profile = parsedNew.ok ? `profile ${parsedNew.policy.profile}` : "unreadable policy text";
    const next = chain.ok && chain.card !== null ? `version ${chain.card.version + 1}` : "card state unreadable";
    return pending(`publishCard update (${next}): ${profile}, policy hash ${keccak256(stringToBytes(text))}, guardian ${lower(String(decoded?.[1]))}`);
  }
  return block("BLOCKED_OTHER", true);
}

// ---------- EIP-712 ----------

function domainChainId(td: TypedDataInfo): number | null {
  const raw = td.domain.chainId;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^(\d+|0x[0-9a-fA-F]+)$/.test(raw)) return Number(BigInt(raw));
  return null;
}

function eip712Allowlisted(td: TypedDataInfo, policy: PolicyV1): boolean {
  const chainId = domainChainId(td);
  const vc = typeof td.domain.verifyingContract === "string" ? lower(td.domain.verifyingContract) : null;
  return policy.rules.eip712.allow.some(
    (e) =>
      e.chainId === chainId &&
      e.domainName === td.domain.name &&
      vc !== null &&
      lower(e.verifyingContract) === vc &&
      e.primaryType === td.primaryType,
  );
}

function grantsAuthority(parsed: Record<string, unknown>): boolean {
  if (typeof parsed.spender === "string" && parsed.spender.length > 0) return true;
  return Array.isArray(parsed.details) && parsed.details.length > 0;
}

function evaluateTypedData(intent: Extract<Intent, { kind: "typedData" }>, policy: PolicyV1): Decision {
  const sign = intent.preview === null ? null : readSignPreview(intent.preview);
  if (sign === null) return block("MALFORMED_PREVIEW");

  const td = intent.typedData;
  if (domainChainId(td) !== SUPPORTED_CHAIN_ID) return block("BLOCKED_EIP712");

  const { mode, deny } = policy.rules.eip712;
  const allowlisted = eip712Allowlisted(td, policy);
  if (mode === "allowlist" && !allowlisted) return block("BLOCKED_EIP712");
  if (mode === "denylist" && (deny ?? []).includes(td.primaryType)) return block("BLOCKED_EIP712");

  if (!allowlisted && policy.rules.blockAuthorityChanges && isObject(td.message) && grantsAuthority(td.message)) {
    return block("BLOCKED_APPROVE");
  }
  if (sign !== null) {
    if (!allowlisted && policy.rules.blockAuthorityChanges && grantsAuthority(sign.parsedMessage)) return block("BLOCKED_APPROVE");
    if (policy.rules.blockOnBinanceRisk && hasRisk(sign.risks)) return block("BLOCKED_BINANCE_RISK");
  }
  return allow();
}

// ---------- contract calls ----------

function evaluateContractCall(intent: Extract<Intent, { kind: "contractCall" }>, policy: PolicyV1): Decision {
  const preview = readContractPreview(intent.preview);
  if (preview === null) return block("MALFORMED_PREVIEW");
  const r = policy.rules;
  const sel = selectorOf(intent.inputData);

  if (r.blockAuthorityChanges && (preview.authorityChanges.length > 0 || preview.allowanceChanges.length > 0)) {
    return block("BLOCKED_APPROVE");
  }
  if (sel === APPROVE_SELECTOR && r.blockUnlimitedApprove) {
    const { args } = decodeFunctionData({ abi: TOKEN_ABI, data: intent.inputData as `0x${string}` });
    if (typeof args?.[1] === "bigint" && args[1] >= UNLIMITED_APPROVE_THRESHOLD) return block("BLOCKED_APPROVE");
  }
  if (sel === SET_APPROVAL_FOR_ALL_SELECTOR && r.blockSetApprovalForAll) {
    const { args } = decodeFunctionData({ abi: TOKEN_ABI, data: intent.inputData as `0x${string}` });
    if (args?.[1] === true) return block("BLOCKED_APPROVE");
  }

  if (r.blockOnBinanceRisk && hasRisk(preview.risks)) return block("BLOCKED_BINANCE_RISK");

  if (intent.valueWei > BigInt(r.maxNativeValueWei)) return block("BLOCKED_OTHER");
  if (sel !== "" && r.deniedSelectors.some((d) => lower(d) === sel)) return block("BLOCKED_SELECTOR");
  if (r.allowedContracts.length > 0 && !r.allowedContracts.some((a) => lower(a) === lower(intent.to))) {
    return block("BLOCKED_OTHER");
  }
  return allow();
}

// ---------- entry point ----------

export function evaluate(intent: Intent, chain: ChainState, cardContract: string): Decision {
  try {
    if (intent.kind === "malformed") return block("MALFORMED_PREVIEW");

    // Step 0: calls to the card contract come first so the owner is never locked out.
    if (intent.kind === "contractCall" && intent.chainId === SUPPORTED_CHAIN_ID && lower(intent.to) === lower(cardContract)) {
      return evaluateCardCall(intent, chain);
    }

    // Step 1: chain.
    if (intent.kind === "contractCall" && intent.chainId !== SUPPORTED_CHAIN_ID) return block("UNSUPPORTED_CHAIN");
    if (intent.kind === "typedData") {
      if (intent.chainId !== SUPPORTED_CHAIN_ID) return block("UNSUPPORTED_CHAIN");
    }
    // x402 payments sign an option chosen by id; the guard cannot see what is signed, so v1 never allows them.
    if (intent.kind === "oneStep" && intent.command === "x402-payment sign") return block("BLOCKED_COMMAND");
    if (intent.kind === "oneStep" && intent.chainId !== SUPPORTED_CHAIN_ID) return block("UNSUPPORTED_CHAIN");

    // Steps 2 to 4: card state and policy.
    if (!chain.ok) return block("CHAIN_READ_FAILED");
    if (chain.card === null) return block("NO_CARD");
    if (chain.card.paused) return block("AGENT_PAUSED");
    const parsed = parsePolicy(chain.card.policyText);
    if (!parsed.ok) return block("POLICY_UNREADABLE");
    const policy = parsed.policy;

    // Step 5: command table. unknownCommand is a hard rule and is never read from the policy.
    if (intent.kind === "unknown") return block("UNKNOWN_COMMAND");
    if (intent.kind === "oneStep") {
      return policy.rules.oneStep.allow.includes(intent.command) ? allow() : block("BLOCKED_COMMAND");
    }

    // Steps 6 to 10.
    if (intent.kind === "typedData") return evaluateTypedData(intent, policy);
    return evaluateContractCall(intent, policy);
  } catch {
    return block("MALFORMED_PREVIEW");
  }
}
