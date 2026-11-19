import { CARD_ABI, leafHash, merkleRoot, verifyProof } from "@apc/policy-core";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { ATTEST_LAG_SEC, buildAttestation, proofFor, saveAttestationFile } from "../src/attest.js";
import { newTmpDir, PLACEHOLDER } from "./helpers.js";

function row(ts: number, bucket: string): string {
  return JSON.stringify({ ts, command: "c", intentHash: "0x1", decision: "BLOCK", reasonCode: "r", policyHash: "0x2", requestId: "id", bucket });
}

describe("buildAttestation", () => {
  it("counts follow buckets, skips bad lines, keeps none lines", () => {
    const lines = [
      row(100, "allowed"),
      row(101, "allowed"),
      row(102, "eip712"),
      row(103, "approve"),
      row(104, "selector"),
      row(105, "other"),
      row(106, "none"),
      "not json",
      JSON.stringify({ command: "x", bucket: "allowed" }),
    ];
    const b = buildAttestation(lines, null, 1000 + ATTEST_LAG_SEC, PLACEHOLDER);
    expect(b.counts).toEqual({ allowed: 2, eip712: 1, approve: 1, selector: 1, other: 1 });
    expect(b.lines).toEqual(lines.slice(0, 7));
  });

  it("respects prev.periodEnd and lag window", () => {
    const lines = [row(1000, "allowed"), row(1001, "allowed"), row(1940, "other"), row(1941, "other")];
    const b = buildAttestation(lines, { periodEnd: 1000 }, 2000, PLACEHOLDER);
    expect(b.lines).toEqual([lines[1], lines[2]]);
    expect(b.periodStart).toBe(1000);
    expect(b.periodEnd).toBe(1940);
  });

  it("without prev, periodStart is smallest ts minus 1", () => {
    const b = buildAttestation([row(500, "allowed"), row(300, "allowed")], null, 2000, PLACEHOLDER);
    expect(b.periodStart).toBe(299);
  });

  it("uses seconds", () => {
    const now = 1_800_000_000;
    const b = buildAttestation([row(now - 500, "allowed")], null, now, PLACEHOLDER);
    expect(b.periodEnd).toBeLessThan(1e11);
    expect(b.periodStart).toBeLessThan(b.periodEnd);
  });

  it("no included line gives null calldata and prompt", () => {
    const b = buildAttestation([row(5000, "allowed"), "junk"], null, 2000, PLACEHOLDER);
    expect(b.lines).toEqual([]);
    expect(b.calldata).toBeNull();
    expect(b.prompt).toBeNull();
  });

  it("calldata decodes back to counts, root and period", () => {
    const lines = [row(100, "allowed"), row(110, "eip712"), row(120, "other")];
    const b = buildAttestation(lines, null, 1000, PLACEHOLDER);
    const d = decodeFunctionData({ abi: CARD_ABI, data: b.calldata! });
    expect(d.functionName).toBe("submitAttestation");
    expect(d.args).toEqual([1, 1, 0, 0, 1, merkleRoot(lines.map(leafHash)), BigInt(b.periodStart), BigInt(b.periodEnd)]);
    expect(b.root).toBe(merkleRoot(lines.map(leafHash)));
  });

  it("prompt content", () => {
    const b = buildAttestation([row(100, "allowed")], null, 1000, PLACEHOLDER);
    expect(b.prompt).toContain("contract-call preview");
    expect(b.prompt).toContain(PLACEHOLDER);
    expect(b.prompt).toContain(b.calldata!);
    expect(b.prompt).toContain("wait for my explicit");
    expect(b.prompt).not.toContain("execute --requestId");
    expect(b.prompt!.split("\n")).toHaveLength(3);
  });
});

describe("save and proof", () => {
  it("proofs verify for every line", () => {
    const lines = [1, 2, 3, 4, 5].map((i) => row(100 + i, "allowed"));
    const b = buildAttestation(lines, null, 1000, PLACEHOLDER);
    const dir = newTmpDir();
    const path = saveAttestationFile(dir, b);
    expect(path.endsWith(`attest-${b.periodEnd}.json`)).toBe(true);
    for (let i = 0; i < lines.length; i++) {
      const p = proofFor(dir, b.periodEnd, i);
      expect(p.line).toBe(lines[i]);
      expect(verifyProof(leafHash(p.line), p.proof, p.root)).toBe(true);
    }
    expect(() => proofFor(dir, b.periodEnd, 5)).toThrow();
    expect(() => proofFor(dir, b.periodEnd, -1)).toThrow();
    expect(() => proofFor(dir, 12345, 0)).toThrow();
  });
});
