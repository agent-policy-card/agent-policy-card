import { describe, expect, it } from "vitest";
import { appendAudit, readAuditLines, type AuditRow } from "../src/audit.js";
import { makeConfig, newTmpDir } from "./helpers.js";

const row = (ts: number): AuditRow => ({
  ts,
  command: "wallet send",
  intentHash: "0xabc",
  decision: "BLOCK",
  reasonCode: "BLOCKED_OTHER",
  policyHash: null,
  requestId: "r1",
  bucket: "other",
});
const KEYS = ["ts", "command", "intentHash", "decision", "reasonCode", "policyHash", "requestId", "bucket"];

describe("audit", () => {
  it("writes lines with exactly the 8 keys in order", () => {
    const cfg = makeConfig(newTmpDir());
    const line = appendAudit(cfg, row(1));
    expect(Object.keys(JSON.parse(line))).toEqual(KEYS);
    expect(readAuditLines(cfg)).toEqual([line]);
  });

  it("does not leak extra properties", () => {
    const cfg = makeConfig(newTmpDir());
    const extra = { ...row(1), calldata: "0xdead", to: "0x1111111111111111111111111111111111111111" } as unknown as AuditRow;
    const line = appendAudit(cfg, extra);
    expect(Object.keys(JSON.parse(line))).toEqual(KEYS);
    expect(line).not.toContain("calldata");
    expect(line).not.toContain("0xdead");
  });

  it("reads lines in order and [] for a fresh dir", () => {
    const cfg = makeConfig(newTmpDir());
    expect(readAuditLines(cfg)).toEqual([]);
    const a = appendAudit(cfg, row(1));
    const b = appendAudit(cfg, row(2));
    expect(readAuditLines(cfg)).toEqual([a, b]);
  });
});
