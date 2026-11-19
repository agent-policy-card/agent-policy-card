// NOTE: the HMAC only catches accidental or clumsy edits of state.json.
// An agent running as the same OS user can read state.key and forge entries.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReasonCode, Verdict } from "@apc/policy-core";
import type { Config } from "./config.js";

export type StateEntry = {
  requestId: string;
  verdict: Verdict;
  reasonCode: ReasonCode;
  cardCall: boolean;
  expiresAt: number;
  intentHash: string;
  summary?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ensureDir(cfg: Config): void {
  mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
}

function loadKey(cfg: Config, create: boolean): string | null {
  const p = join(cfg.dataDir, "state.key");
  if (existsSync(p)) {
    const k = readFileSync(p, "utf8").trim();
    return k.length > 0 ? k : null;
  }
  if (!create) return null;
  ensureDir(cfg);
  const k = randomBytes(32).toString("hex");
  writeFileSync(p, k, { mode: 0o600 });
  chmodSync(p, 0o600);
  return k;
}

function macOf(key: string, entries: Record<string, StateEntry>): string {
  return createHmac("sha256", key).update(JSON.stringify(entries)).digest("hex");
}

function readStore(cfg: Config, key: string): Record<string, StateEntry> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cfg.dataDir, "state.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { entries, mac } = parsed as { entries?: unknown; mac?: unknown };
    if (typeof entries !== "object" || entries === null || Array.isArray(entries) || typeof mac !== "string") return null;
    const expected = Buffer.from(macOf(key, entries as Record<string, StateEntry>));
    const got = Buffer.from(mac);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    return entries as Record<string, StateEntry>;
  } catch {
    return null;
  }
}

function writeStore(cfg: Config, key: string, entries: Record<string, StateEntry>): void {
  ensureDir(cfg);
  const tmp = join(cfg.dataDir, `state.json.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, JSON.stringify({ entries, mac: macOf(key, entries) }), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, join(cfg.dataDir, "state.json"));
}

export function putEntry(cfg: Config, e: StateEntry, now: number = Date.now()): void {
  const key = loadKey(cfg, true) as string;
  const current = readStore(cfg, key) ?? {};
  const entries: Record<string, StateEntry> = {};
  for (const [id, v] of Object.entries(current)) {
    if (typeof v?.expiresAt === "number" && v.expiresAt >= now - DAY_MS) entries[id] = v;
  }
  entries[e.requestId] = e;
  writeStore(cfg, key, entries);
}

export function getEntry(cfg: Config, requestId: string): StateEntry | null {
  try {
    const key = loadKey(cfg, false);
    if (key === null) return null;
    const entries = readStore(cfg, key);
    if (entries === null || !Object.prototype.hasOwnProperty.call(entries, requestId)) return null;
    return entries[requestId] ?? null;
  } catch {
    return null;
  }
}

export function setVerdict(cfg: Config, requestId: string, verdict: Verdict): void {
  let key: string | null = null;
  let entries: Record<string, StateEntry> | null = null;
  try {
    key = loadKey(cfg, false);
    entries = key === null ? null : readStore(cfg, key);
  } catch {
    entries = null;
  }
  if (key === null || entries === null || !Object.prototype.hasOwnProperty.call(entries, requestId)) {
    throw new Error("unknown requestId");
  }
  const existing = entries[requestId] as StateEntry;
  entries[requestId] = { ...existing, verdict };
  writeStore(cfg, key, entries);
}
