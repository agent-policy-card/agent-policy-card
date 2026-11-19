import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AttestBucket, ReasonCode, Verdict } from "@apc/policy-core";
import type { Config } from "./config.js";

export type AuditRow = {
  ts: number;
  command: string;
  intentHash: string;
  decision: Verdict;
  reasonCode: ReasonCode;
  policyHash: string | null;
  requestId: string | null;
  bucket: AttestBucket;
};

const FILE = "audit.jsonl";

export function appendAudit(cfg: Config, row: AuditRow): string {
  mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
  // Explicit field list: nothing else is ever written.
  const line = JSON.stringify({
    ts: row.ts,
    command: row.command,
    intentHash: row.intentHash,
    decision: row.decision,
    reasonCode: row.reasonCode,
    policyHash: row.policyHash,
    requestId: row.requestId,
    bucket: row.bucket,
  });
  appendFileSync(join(cfg.dataDir, FILE), line + "\n", { mode: 0o600 });
  return line;
}

export function readAuditLines(cfg: Config): string[] {
  const p = join(cfg.dataDir, FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}
