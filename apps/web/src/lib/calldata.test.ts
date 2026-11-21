import { CARD_ABI, PRESETS, canonicalize } from "@apc/policy-core";
import { decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { buildAgentPrompt, buildPublishCalldata } from "./calldata";

const ADDR = "0x1111111111111111111111111111111111111111";
const GUARDIAN = "0x2222222222222222222222222222222222222222";

describe("buildPublishCalldata", () => {
  it("encodes the canonical policy and the zero guardian", () => {
    const data = buildPublishCalldata(PRESETS["eip712-shield"], null);
    const decoded = decodeFunctionData({ abi: CARD_ABI, data });
    expect(decoded.functionName).toBe("publishCard");
    const [policyText, guardian] = decoded.args as readonly [string, string];
    expect(policyText).toBe(canonicalize(PRESETS["eip712-shield"]));
    expect(guardian).toBe(zeroAddress);
  });

  it("passes a valid guardian through", () => {
    const data = buildPublishCalldata(PRESETS["zero-spend"], GUARDIAN.toUpperCase().replace("0X", "0x"));
    const decoded = decodeFunctionData({ abi: CARD_ABI, data });
    const [, guardian] = decoded.args as readonly [string, string];
    expect(guardian.toLowerCase()).toBe(GUARDIAN);
  });

  it("throws on an invalid guardian", () => {
    expect(() => buildPublishCalldata(PRESETS["eip712-shield"], "0x123")).toThrow();
  });

  it("throws for strict-allowlist with no contracts", () => {
    expect(() => buildPublishCalldata(PRESETS["strict-allowlist"], null)).toThrow();
  });

  it("accepts strict-allowlist with one address", () => {
    const p = structuredClone(PRESETS["strict-allowlist"]);
    p.rules.allowedContracts = [ADDR];
    expect(() => buildPublishCalldata(p, null)).not.toThrow();
  });

  it("throws when the canonical text exceeds 2048 bytes", () => {
    const p = structuredClone(PRESETS["eip712-shield"]);
    p.rules.allowedContracts = Array.from({ length: 60 }, () => ADDR);
    expect(new TextEncoder().encode(canonicalize(p)).length).toBeGreaterThan(2048);
    expect(() => buildPublishCalldata(p, null)).toThrow();
  });
});

describe("buildAgentPrompt", () => {
  it("builds the three line prompt", () => {
    const calldata = buildPublishCalldata(PRESETS["eip712-shield"], null);
    const prompt = buildAgentPrompt(ADDR, calldata);
    expect(prompt.split("\n")).toHaveLength(3);
    expect(prompt).toContain("--binanceChainId 56");
    expect(prompt).toContain(ADDR);
    expect(prompt).toContain(calldata);
    expect(prompt).toContain('wait for my explicit "yes" before running contract-call execute.');
    expect(prompt).not.toContain("execute --requestId");
  });
});

describe("buildAiProPrompt", () => {
  it("asks the in-app assistant for a contract call with preview and an explicit yes, without CLI syntax", async () => {
    const { buildAiProPrompt, buildPublishCalldata } = await import("./calldata");
    const { PRESETS } = await import("@apc/policy-core");
    const cd = buildPublishCalldata(PRESETS["eip712-shield"], null);
    const p = buildAiProPrompt("0x2222222222222222222222222222222222222222", cd);
    expect(p).toContain("BNB Smart Chain (chain id 56)");
    expect(p).toContain("0x2222222222222222222222222222222222222222");
    expect(p).toContain(cd);
    expect(p).toContain("value 0");
    expect(p).toContain('wait for my explicit "yes"');
    expect(p).not.toContain("baw ");
    expect(p).not.toContain("execute --requestId");
  });
});
