import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_ABI, type ChainState } from "@apc/policy-core";
import { createPublicClient, fallback, http } from "viem";
import type { Config } from "./config.js";

export const POLICY_CACHE_MS = 30_000;
export const RPC_TIMEOUT_MS = 4_000;

type CacheEntry = { version: number; policyText: string; fetchedAt: number };

function client(cfg: Config) {
  return createPublicClient({
    transport: fallback(cfg.rpcUrls.map((u) => http(u, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }))),
  });
}

function cacheKey(cfg: Config, owner: string): string {
  return `${cfg.cardContract.toLowerCase()}:${owner.toLowerCase()}`;
}

function readCache(cfg: Config): Record<string, CacheEntry> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cfg.dataDir, "cache.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, CacheEntry>;
    }
  } catch {
    // missing or corrupt: ignored and overwritten on the next write
  }
  return {};
}

function validCacheEntry(e: unknown): e is CacheEntry {
  if (typeof e !== "object" || e === null) return false;
  const c = e as Record<string, unknown>;
  return (
    typeof c.version === "number" &&
    Number.isInteger(c.version) &&
    typeof c.policyText === "string" &&
    typeof c.fetchedAt === "number"
  );
}

function writeCache(cfg: Config, cache: Record<string, CacheEntry>): void {
  try {
    mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
    const p = join(cfg.dataDir, "cache.json");
    writeFileSync(p, JSON.stringify(cache), { mode: 0o600 });
    chmodSync(p, 0o600);
  } catch {
    // a failed cache write only costs a refetch
  }
}

async function isPaused(cfg: Config, owner: string): Promise<boolean> {
  const r = await client(cfg).readContract({
    address: cfg.cardContract as `0x${string}`,
    abi: CARD_ABI,
    functionName: "isPaused",
    args: [owner as `0x${string}`],
  });
  if (typeof r !== "boolean") throw new Error("bad isPaused result");
  return r;
}

export async function readChainState(cfg: Config, owner: string, opts: { now?: () => number } = {}): Promise<ChainState> {
  try {
    const now = (opts.now ?? Date.now)();
    const cache = readCache(cfg);
    const key = cacheKey(cfg, owner);
    const hit = cache[key];
    if (validCacheEntry(hit) && hit.version > 0 && now - hit.fetchedAt < POLICY_CACHE_MS && now >= hit.fetchedAt) {
      const paused = await isPaused(cfg, owner);
      return { ok: true, card: { version: hit.version, paused, policyText: hit.policyText } };
    }
    const card = await client(cfg).readContract({
      address: cfg.cardContract as `0x${string}`,
      abi: CARD_ABI,
      functionName: "getCard",
      args: [owner as `0x${string}`],
    });
    if (card.version === 0) return { ok: true, card: null };
    cache[key] = { version: card.version, policyText: card.policyText, fetchedAt: now };
    writeCache(cfg, cache);
    return { ok: true, card: { version: card.version, paused: card.paused, policyText: card.policyText } };
  } catch {
    return { ok: false };
  }
}

export async function readPaused(cfg: Config, owner: string): Promise<boolean | null> {
  try {
    return await isPaused(cfg, owner);
  } catch {
    return null;
  }
}
