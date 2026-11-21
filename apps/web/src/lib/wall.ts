// The public wall of published cards: read every CardPublished event, then each owner's card.
// Addresses come only from chain data at runtime; no name lookups.
import { CARD_ABI, CARD_CONTRACT, DEPLOY_BLOCK, parsePolicy } from "@apc/policy-core";
import { toFacts } from "./facts";
import type { PublicClient } from "viem";

export const FOUNDING_LIMIT = 50;

export type PublishLog = { owner: string; block: bigint; logIndex: number; version: number };
export type CardSnapshot = {
  paused: boolean;
  version: number;
  totalBlocked: number | null;
  allowed: number | null;
  updatedAt: number;
  ruleCount: number;
};
export type WallEntry = { owner: string; founding: number | null; firstBlock: bigint; card: CardSnapshot | null };
export type Wall = { entries: WallEntry[]; totals: { cards: number; paused: number; blocked: number; attested: number } };

export function buildWall(logs: PublishLog[], snapshots: Record<string, CardSnapshot>): Wall {
  const firsts = new Map<string, PublishLog>();
  const ordered = [...logs].sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  for (const log of ordered) {
    const owner = log.owner.toLowerCase();
    if (!firsts.has(owner)) firsts.set(owner, log);
  }
  const lowerSnaps = new Map(Object.entries(snapshots).map(([k, v]) => [k.toLowerCase(), v]));
  const entries: WallEntry[] = [...firsts.entries()].map(([owner, log], i) => ({
    owner,
    founding: i < FOUNDING_LIMIT ? i + 1 : null,
    firstBlock: log.block,
    card: lowerSnaps.get(owner) ?? null,
  }));
  const totals = { cards: entries.length, paused: 0, blocked: 0, attested: 0 };
  for (const e of entries) {
    if (!e.card) continue;
    if (e.card.paused) totals.paused++;
    if (e.card.totalBlocked !== null) {
      totals.blocked += e.card.totalBlocked;
      totals.attested++;
    }
  }
  return { entries, totals };
}

const PUBLISHED = CARD_ABI.find((x) => x.type === "event" && x.name === "CardPublished");

async function getPublishLogs(client: PublicClient, toBlock: bigint, range: bigint, start: bigint): Promise<PublishLog[]> {
  if (!PUBLISHED || PUBLISHED.type !== "event") return [];
  const windows: [bigint, bigint][] = [];
  for (let from = start; from <= toBlock; from += range) {
    windows.push([from, from + range - 1n < toBlock ? from + range - 1n : toBlock]);
  }
  const out: PublishLog[] = [];
  const CONCURRENCY = 10;
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      windows.slice(i, i + CONCURRENCY).map(([fromBlock, to]) =>
        client.getLogs({ address: CARD_CONTRACT as `0x${string}`, event: PUBLISHED, fromBlock, toBlock: to }),
      ),
    );
    for (const logs of batch) {
      for (const l of logs) {
        const args = l.args as { owner?: string; version?: number };
        if (typeof args.owner === "string") {
          out.push({ owner: args.owner, block: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0, version: Number(args.version ?? 0) });
        }
      }
    }
  }
  return out;
}

const CACHE_KEY = `apc-wall-logs:${CARD_CONTRACT.toLowerCase()}`;
type CachedLogs = { head: string; logs: { owner: string; block: string; logIndex: number; version: number }[] };

// Per-viewer convenience only: remembers scanned events so the next visit scans new blocks only.
function loadCache(): { head: bigint; logs: PublishLog[] } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedLogs;
    return { head: BigInt(c.head), logs: c.logs.map((l) => ({ ...l, block: BigInt(l.block) })) };
  } catch {
    return null;
  }
}

function saveCache(head: bigint, logs: PublishLog[]): void {
  try {
    const c: CachedLogs = { head: head.toString(), logs: logs.map((l) => ({ ...l, block: l.block.toString() })) };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // storage unavailable: the wall still works, it just rescans next time
  }
}

export async function fetchWall(client: PublicClient, logsClient: PublicClient, range: bigint): Promise<Wall> {
  const head = await logsClient.getBlockNumber();
  const cached = typeof window === "undefined" ? null : loadCache();
  const start = cached && cached.head < head ? cached.head + 1n : DEPLOY_BLOCK;
  const fresh = cached && cached.head >= head ? [] : await getPublishLogs(logsClient, head, range, start);
  const logs = [...(cached?.logs ?? []), ...fresh];
  if (typeof window !== "undefined") saveCache(head, logs);
  const owners = [...new Set(logs.map((l) => l.owner.toLowerCase()))] as `0x${string}`[];
  const snapshots: Record<string, CardSnapshot> = {};
  await Promise.all(
    owners.map(async (owner) => {
      try {
        const [card, att] = await Promise.all([
          client.readContract({ address: CARD_CONTRACT as `0x${string}`, abi: CARD_ABI, functionName: "getCard", args: [owner] }),
          client.readContract({ address: CARD_CONTRACT as `0x${string}`, abi: CARD_ABI, functionName: "getLatestAttestation", args: [owner] }),
        ]);
        const parsed = parsePolicy(card.policyText);
        const attested = Number(att.epoch) > 0;
        snapshots[owner] = {
          paused: card.paused,
          version: Number(card.version),
          totalBlocked: attested ? Number(att.blockedEip712) + Number(att.blockedApprove) + Number(att.blockedSelector) + Number(att.blockedOther) : null,
          allowed: attested ? Number(att.allowedCount) : null,
          updatedAt: Number(card.updatedAt),
          ruleCount: parsed.ok ? toFacts(parsed.policy).rules.length : 0,
        };
      } catch {
        // leave this owner without a snapshot; it still appears on the wall
      }
    }),
  );
  return buildWall(logs, snapshots);
}
