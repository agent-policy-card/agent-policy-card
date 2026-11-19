import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_ABI, leafHash, merkleProof, merkleRoot } from "@apc/policy-core";
import { encodeFunctionData, type Hex } from "viem";

export type AttestCounts = { allowed: number; eip712: number; approve: number; selector: number; other: number };
export type AttestBuild = {
  counts: AttestCounts;
  root: Hex;
  periodStart: number;
  periodEnd: number;
  lines: string[];
  calldata: Hex | null;
  prompt: string | null;
};

export const ATTEST_LAG_SEC = 60;

function parseRow(line: string): { ts: number; bucket: unknown } | null {
  try {
    const v: unknown = JSON.parse(line);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    if (typeof r.ts !== "number" || !Number.isInteger(r.ts)) return null;
    return { ts: r.ts, bucket: r.bucket };
  } catch {
    return null;
  }
}

export function buildAttestation(
  lines: string[],
  prev: { periodEnd: number } | null,
  nowSec: number,
  cardContract: string,
): AttestBuild {
  const periodEnd = nowSec - ATTEST_LAG_SEC;
  const counts: AttestCounts = { allowed: 0, eip712: 0, approve: 0, selector: 0, other: 0 };
  const included: string[] = [];
  let minTs = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const row = parseRow(line);
    if (row === null) continue;
    const inWindow = prev === null ? row.ts <= periodEnd : row.ts > prev.periodEnd && row.ts <= periodEnd;
    if (!inWindow) continue;
    included.push(line);
    if (row.ts < minTs) minTs = row.ts;
    switch (row.bucket) {
      case "allowed":
      case "eip712":
      case "approve":
      case "selector":
      case "other":
        counts[row.bucket] += 1;
        break;
      default:
        break;
    }
  }
  const periodStart = prev ? prev.periodEnd : included.length > 0 ? minTs - 1 : periodEnd;
  const root = merkleRoot(included.map(leafHash));
  if (included.length === 0) {
    return { counts, root, periodStart, periodEnd, lines: included, calldata: null, prompt: null };
  }
  const calldata = encodeFunctionData({
    abi: CARD_ABI,
    functionName: "submitAttestation",
    args: [counts.allowed, counts.eip712, counts.approve, counts.selector, counts.other, root, BigInt(periodStart), BigInt(periodEnd)],
  });
  const prompt = [
    "Submit my Agent Policy Card attestation on BNB Chain.",
    `Run: baw contract-call preview --binanceChainId 56 --from <MY_AGENTIC_WALLET> --to ${cardContract} --value 0 --inputData ${calldata} --json`,
    'Show me the parsed transaction and risks, then wait for my explicit "yes" before running contract-call execute.',
  ].join("\n");
  return { counts, root, periodStart, periodEnd, lines: included, calldata, prompt };
}

export function saveAttestationFile(dataDir: string, b: AttestBuild): string {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, `attest-${b.periodEnd}.json`);
  writeFileSync(path, JSON.stringify({ periodStart: b.periodStart, periodEnd: b.periodEnd, root: b.root, lines: b.lines }), {
    mode: 0o600,
  });
  return path;
}

export function proofFor(dataDir: string, periodEnd: number, index: number): { line: string; proof: Hex[]; root: Hex } {
  if (!Number.isInteger(periodEnd)) throw new Error("periodEnd must be an integer");
  const raw = readFileSync(join(dataDir, `attest-${periodEnd}.json`), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("attestation file is malformed");
  const f = parsed as Record<string, unknown>;
  if (typeof f.root !== "string" || !Array.isArray(f.lines) || !f.lines.every((l) => typeof l === "string")) {
    throw new Error("attestation file is malformed");
  }
  const lines = f.lines as string[];
  const proof = merkleProof(lines.map(leafHash), index);
  return { line: lines[index]!, proof, root: f.root as Hex };
}
