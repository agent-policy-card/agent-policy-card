import { leafHash, verifyProof } from "@apc/policy-core";
import type { Hex } from "viem";

/** Parses JSON output from "apc-attest proof" and verifies it against the on-chain Merkle root. */
export function verifyAuditLine(input: string, root: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Expected { line, proof }" };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.line !== "string" || !Array.isArray(obj.proof) || !obj.proof.every((p) => typeof p === "string")) {
    return { ok: false, error: "Expected { line, proof }" };
  }
  if (!verifyProof(leafHash(obj.line), obj.proof as Hex[], root as Hex)) {
    return { ok: false, error: "Proof does not match the on-chain root" };
  }
  return { ok: true };
}
