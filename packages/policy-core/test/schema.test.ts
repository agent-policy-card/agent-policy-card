import { describe, expect, it } from "vitest";
import { PRESETS, canonicalize, parsePolicy } from "../src/index.js";
import type { PolicyV1 } from "../src/index.js";

const SHIELD =
  '{"profile":"eip712-shield","rules":{"allowedContracts":[],"blockAuthorityChanges":true,"blockOnBinanceRisk":true,"blockSetApprovalForAll":true,"blockUnlimitedApprove":true,"deniedSelectors":[],"eip712":{"allow":[],"mode":"allowlist"},"maxNativeValueWei":"10000000000000000","oneStep":{"allow":["wallet send","market-order swap"]},"unknownCommand":"block"},"v":1}';

const base = (): any => JSON.parse(JSON.stringify(PRESETS["eip712-shield"]));
const bad = (mutate: (p: any) => void): boolean => {
  const p = base();
  mutate(p);
  return parsePolicy(JSON.stringify(p)).ok;
};

describe("canonicalize", () => {
  it("matches the exact eip712-shield string", () => {
    expect(canonicalize(PRESETS["eip712-shield"])).toBe(SHIELD);
  });

  it("sorts keys at every depth", () => {
    const p = PRESETS["eip712-shield"];
    const rev = (o: any): any =>
      Array.isArray(o)
        ? o.map(rev)
        : o && typeof o === "object"
          ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, rev(o[k])]))
          : o;
    expect(canonicalize(rev(p) as PolicyV1)).toBe(canonicalize(p));
  });
});

describe("presets", () => {
  for (const name of ["eip712-shield", "zero-spend", "strict-allowlist"] as const) {
    it(`${name}: small and round trips`, () => {
      const p = PRESETS[name];
      const text = canonicalize(p);
      expect(new TextEncoder().encode(text).length).toBeLessThan(600);
      const r = parsePolicy(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.policy).toEqual(p);
    });
  }

  it("zero-spend values", () => {
    const p = PRESETS["zero-spend"];
    expect(p.rules.maxNativeValueWei).toBe("0");
    expect(p.rules.oneStep.allow).toEqual([]);
    expect(p.rules.eip712.allow).toEqual([]);
  });
});

describe("parsePolicy rejects", () => {
  it("not json", () => {
    expect(parsePolicy("not json").ok).toBe(false);
  });
  it("null and []", () => {
    expect(parsePolicy("null").ok).toBe(false);
    expect(parsePolicy("[]").ok).toBe(false);
  });
  it("wrong v", () => {
    expect(bad((p) => (p.v = 2))).toBe(false);
  });
  it("missing eip712", () => {
    expect(bad((p) => delete p.rules.eip712)).toBe(false);
  });
  it("extra keys", () => {
    expect(bad((p) => (p.extra = 1))).toBe(false);
    expect(bad((p) => (p.rules.extra = 1))).toBe(false);
  });
  it("unknownCommand allow", () => {
    expect(bad((p) => (p.rules.unknownCommand = "allow"))).toBe(false);
  });
  it("bad maxNativeValueWei", () => {
    for (const v of ["-1", "1e18", ""]) {
      expect(bad((p) => (p.rules.maxNativeValueWei = v))).toBe(false);
    }
  });
  it("bad allowedContracts", () => {
    expect(bad((p) => (p.rules.allowedContracts = ["0x123"]))).toBe(false);
  });
  it("bad deniedSelectors", () => {
    expect(bad((p) => (p.rules.deniedSelectors = ["0x1234"]))).toBe(false);
  });
  it("bad chainId", () => {
    for (const chainId of [0, 1.5]) {
      expect(
        bad((p) =>
          p.rules.eip712.allow.push({
            chainId,
            domainName: "X",
            verifyingContract: "0x1111111111111111111111111111111111111111",
            primaryType: "Permit",
          }),
        ),
      ).toBe(false);
    }
  });
  it("accepts a valid chainId", () => {
    expect(
      bad((p) =>
        p.rules.eip712.allow.push({
          chainId: 56,
          domainName: "X",
          verifyingContract: "0x1111111111111111111111111111111111111111",
          primaryType: "Permit",
        }),
      ),
    ).toBe(true);
  });
});
