import { leafHash, merkleProof, merkleRoot } from "@apc/policy-core";
import { describe, expect, it } from "vitest";
import { verifyAuditLine } from "./verify";

const LINES = [
  '{"ts":1700000001,"command":"contract-call preview","decision":"ALLOW_FOR_PREVIEW","reasonCode":"OK"}',
  '{"ts":1700000002,"command":"sign-message preview","decision":"BLOCK","reasonCode":"BLOCKED_EIP712"}',
  '{"ts":1700000003,"command":"contract-call preview","decision":"BLOCK","reasonCode":"BLOCKED_APPROVE"}',
];

describe("verifyAuditLine", () => {
  it("verifies a real proof built over three leafHash lines", () => {
    const leaves = LINES.map(leafHash);
    const root = merkleRoot(leaves);
    for (let i = 0; i < LINES.length; i++) {
      const payload = JSON.stringify({ line: LINES[i], proof: merkleProof(leaves, i) });
      expect(verifyAuditLine(payload, root)).toEqual({ ok: true });
    }
  });

  it("accepts output from apc-attest proof and still checks against the on-chain root", () => {
    const leaves = LINES.map(leafHash);
    const root = merkleRoot(leaves);
    const fakeRoot = `0x${"ff".repeat(32)}`;
    const payload = JSON.stringify({ line: LINES[1], proof: merkleProof(leaves, 1), root: fakeRoot });
    expect(verifyAuditLine(payload, root)).toEqual({ ok: true });
    expect(verifyAuditLine(payload, fakeRoot)).toEqual({
      ok: false,
      error: "Proof does not match the on-chain root",
    });
  });

  it("fails with mismatch error when the line is changed", () => {
    const leaves = LINES.map(leafHash);
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 1);
    const tampered = JSON.stringify({ line: `${LINES[1]} `, proof });
    expect(verifyAuditLine(tampered, root)).toEqual({
      ok: false,
      error: "Proof does not match the on-chain root",
    });
  });

  it("returns Not valid JSON for unparseable input", () => {
    const root = merkleRoot(LINES.map(leafHash));
    expect(verifyAuditLine("x", root)).toEqual({ ok: false, error: "Not valid JSON" });
  });

  it("returns Expected { line, proof } for wrong JSON shapes", () => {
    const root = merkleRoot(LINES.map(leafHash));
    expect(verifyAuditLine('{"line":1}', root)).toEqual({ ok: false, error: "Expected { line, proof }" });
    expect(verifyAuditLine("null", root)).toEqual({ ok: false, error: "Expected { line, proof }" });
    expect(verifyAuditLine("[]", root)).toEqual({ ok: false, error: "Expected { line, proof }" });
    expect(verifyAuditLine('{"line":"abc","proof":[123]}', root)).toEqual({
      ok: false,
      error: "Expected { line, proof }",
    });
  });
});
