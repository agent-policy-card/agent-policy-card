import { PRESETS, canonicalize, parsePolicy } from "@apc/policy-core";
import { describe, expect, it } from "vitest";
import { toFacts, shortAddress } from "./facts";

describe("toFacts", () => {
  it("splits the default preset into numbered rules and limits", () => {
    const f = toFacts(PRESETS["eip712-shield"]);
    expect(f.rules.map((r) => r.number)).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(f.rules[0]!.text).toBe("Blocks every EIP-712 signature except allowlisted ones");
    expect(f.rules.at(-1)!.text).toBe("Unknown commands are always blocked");
    expect(f.limits).toEqual([
      { label: "Max native value per call", value: "0.01 BNB" },
      { label: "Chain", value: "BNB Smart Chain (56)" },
      { label: "One-step commands", value: "wallet send, market-order swap" },
    ]);
  });

  it("reports no one-step commands and allowlisted signatures as limits", () => {
    const p = structuredClone(PRESETS["zero-spend"]);
    p.rules.eip712.allow = [{ chainId: 56, domainName: "SOLVDLogin", primaryType: "Login" }];
    const f = toFacts(p);
    expect(f.limits).toContainEqual({ label: "One-step commands", value: "None" });
    expect(f.limits).toContainEqual({ label: "Allowlisted signatures", value: "1" });
    expect(f.rules.some((r) => r.text.startsWith("Allowlisted"))).toBe(false);
  });

  it("works from published policy text", () => {
    const r = parsePolicy(canonicalize(PRESETS["strict-allowlist"]));
    expect(r.ok && toFacts(r.policy).rules.length).toBeGreaterThan(0);
  });
});

describe("shortAddress", () => {
  it("keeps the first 6 and last 4 characters", () => {
    expect(shortAddress("0x2222222222222222222222222222222222222222")).toBe("0x2222…2222");
  });
});
