// The public wall of published cards: read every CardPublished event, then each owner's card.
// Addresses come only from chain data at runtime; no name lookups.
import { CARD_ABI, CARD_CONTRACT, mergeIndex, parsePolicy, parseWallIndex, scanEvents, type ScanClient, type WallIndex } from "@apc/policy-core";
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

/** Publish events from the index, as the wall orders them. */
export function publishLogs(index: WallIndex): PublishLog[] {
  return index.events
    .filter((e) => e.event === "CardPublished")
    .map((e) => ({ owner: e.owner, block: BigInt(e.block), logIndex: e.logIndex, version: 0 }));
}

// The site scans the recent tail itself only while it is short; beyond this the scheduled index
// is trusted as is (it runs every few minutes, so this only happens if that job has stalled).
export const LIVE_TAIL_MAX = 60_000n;

async function loadIndex(url: string): Promise<WallIndex> {
  const res = await fetch(url, { cache: "no-store" });
  const idx = res.ok ? parseWallIndex(await res.json()) : null;
  if (!idx) throw new Error("wall index unavailable");
  return idx;
}

export async function fetchWall(client: PublicClient, logsClient: PublicClient, indexUrl = "./wall-index.json"): Promise<Wall> {
  let index = await loadIndex(indexUrl);
  try {
    const head = await logsClient.getBlockNumber();
    const from = BigInt(index.head) + 1n;
    if (head >= from && head - from <= LIVE_TAIL_MAX) {
      index = mergeIndex(index, await scanEvents(logsClient as unknown as ScanClient, from, head), head);
    }
  } catch {
    // the tail is a freshness bonus; the scheduled index alone still fills the shelf
  }
  const logs = publishLogs(index);
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
