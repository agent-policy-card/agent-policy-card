// Turns a policy into the rows of a Policy Facts panel: numbered rules and labelled limits.
import { describePolicy, type PolicyV1 } from "@apc/policy-core";

export type RuleRow = { number: string; text: string };
export type LimitRow = { label: string; value: string };
export type Facts = { rules: RuleRow[]; limits: LimitRow[] };

const NATIVE = "Max native value per call: ";
const ONE_STEP = "One-step commands allowed: ";
const ALLOWLISTED = "Allowlisted EIP-712 signatures: ";

export function toFacts(policy: PolicyV1): Facts {
  const ruleTexts: string[] = [];
  const limits: LimitRow[] = [];
  let oneStep = "None";
  let allowlisted: string | null = null;
  for (const line of describePolicy(policy)) {
    if (line.startsWith(NATIVE)) limits.push({ label: "Max native value per call", value: line.slice(NATIVE.length) });
    else if (line.startsWith(ONE_STEP)) oneStep = line.slice(ONE_STEP.length);
    else if (line === "No one-step write commands allowed") oneStep = "None";
    else if (line.startsWith(ALLOWLISTED)) allowlisted = line.slice(ALLOWLISTED.length);
    else ruleTexts.push(line);
  }
  limits.push({ label: "Chain", value: "BNB Smart Chain (56)" });
  limits.push({ label: "One-step commands", value: oneStep });
  if (allowlisted !== null) limits.push({ label: "Allowlisted signatures", value: allowlisted });
  return { rules: ruleTexts.map((text, i) => ({ number: String(i + 1).padStart(2, "0"), text })), limits };
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
