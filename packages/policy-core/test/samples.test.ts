import { describe, expect, it } from "vitest";
import { evaluate } from "../src/evaluate.js";
import { PRESETS } from "../src/presets.js";
import { canonicalize } from "../src/schema.js";
import { SAMPLE_CARD_CONTRACT, SAMPLE_INTENTS } from "../src/samples.js";
import type { PolicyV1 } from "../src/types.js";

const shieldText = canonicalize(PRESETS["eip712-shield"]);

describe("SAMPLE_INTENTS", () => {
  it("contains the four expected samples and none is malformed", () => {
    expect(SAMPLE_CARD_CONTRACT).toBe("0x2222222222222222222222222222222222222222");
    expect(SAMPLE_INTENTS.map((s) => s.id)).toEqual([
      "permit",
      "transferWithAuthorization",
      "setApprovalForAll",
      "approveMax",
    ]);
    expect(SAMPLE_INTENTS.map((s) => s.label)).toEqual([
      "Token Permit signature",
      "Transfer authorization signature",
      "Approve all NFTs",
      "Unlimited token approval",
    ]);
    for (const sample of SAMPLE_INTENTS) {
      expect(sample.intent.kind).not.toBe("malformed");
    }
  });

  it("blocks the four samples under eip712-shield when active", () => {
    const chain = { ok: true as const, card: { version: 1, paused: false, policyText: shieldText } };
    const results = SAMPLE_INTENTS.map((s) => evaluate(s.intent, chain, SAMPLE_CARD_CONTRACT));
    expect(results.map((r) => r.verdict)).toEqual(["BLOCK", "BLOCK", "BLOCK", "BLOCK"]);
    expect(results.map((r) => r.reasonCode)).toEqual([
      "BLOCKED_EIP712",
      "BLOCKED_EIP712",
      "BLOCKED_APPROVE",
      "BLOCKED_APPROVE",
    ]);
  });

  it("returns AGENT_PAUSED for all four samples when paused", () => {
    const chain = { ok: true as const, card: { version: 1, paused: true, policyText: shieldText } };
    const results = SAMPLE_INTENTS.map((s) => evaluate(s.intent, chain, SAMPLE_CARD_CONTRACT));
    expect(results.map((r) => r.verdict)).toEqual(["BLOCK", "BLOCK", "BLOCK", "BLOCK"]);
    expect(results.map((r) => r.reasonCode)).toEqual([
      "AGENT_PAUSED",
      "AGENT_PAUSED",
      "AGENT_PAUSED",
      "AGENT_PAUSED",
    ]);
  });

  it("passes preview validation and allows under a permissive policy", () => {
    const permissive: PolicyV1 = structuredClone(PRESETS["eip712-shield"]);
    permissive.rules.eip712 = { allow: [], deny: [], mode: "denylist" };
    permissive.rules.blockAuthorityChanges = false;
    permissive.rules.blockSetApprovalForAll = false;
    permissive.rules.blockUnlimitedApprove = false;
    const chain = { ok: true as const, card: { version: 1, paused: false, policyText: canonicalize(permissive) } };
    const results = SAMPLE_INTENTS.map((s) => evaluate(s.intent, chain, SAMPLE_CARD_CONTRACT));
    expect(results.map((r) => r.verdict)).toEqual([
      "ALLOW_FOR_PREVIEW",
      "ALLOW_FOR_PREVIEW",
      "ALLOW_FOR_PREVIEW",
      "ALLOW_FOR_PREVIEW",
    ]);
    expect(results.map((r) => r.reasonCode)).toEqual(["OK", "OK", "OK", "OK"]);
  });
});
