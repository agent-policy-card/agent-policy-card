// Event index for the card contract. Free public BSC RPCs keep only about a day of logs and cap
// eth_getLogs ranges, so a scheduled job carries the index forward and the site reads it as a
// static file, then scans only the recent tail itself. Addresses come only from chain data.
import { CARD_CONTRACT, CHAIN_ID } from "./deployment.js";
import { CARD_ABI } from "./selectors.js";

export const LOG_WINDOW = 10_000n;
/** Busy BEP-20 contract (BSC USDT) used to check that a node still holds logs for a block. */
export const RETENTION_CANARY = "0x55d398326f99059fF775485246999027B3197955";

export type IndexedEvent = {
  event: string;
  owner: string;
  triggeredBy?: string;
  block: string;
  logIndex: number;
  tx: string;
};

export type WallIndex = { contract: string; chainId: number; head: string; events: IndexedEvent[] };

export type LogLike = {
  eventName?: string;
  args?: unknown;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: string | null;
};

export const CARD_EVENTS = CARD_ABI.filter((x) => x.type === "event");

/** viem's PublicClient fits this shape; `events` asks it to decode the card events. */
export type ScanClient = {
  getLogs: (p: { address: `0x${string}`; fromBlock: bigint; toBlock: bigint; events?: typeof CARD_EVENTS }) => Promise<LogLike[]>;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

export function emptyIndex(head: bigint): WallIndex {
  return { contract: CARD_CONTRACT.toLowerCase(), chainId: CHAIN_ID, head: head.toString(), events: [] };
}

export function toIndexedEvents(logs: LogLike[]): IndexedEvent[] {
  const out: IndexedEvent[] = [];
  for (const l of logs) {
    const args = (l.args ?? {}) as Record<string, unknown>;
    if (!l.eventName || typeof args.owner !== "string" || !ADDRESS.test(args.owner)) continue;
    if (l.blockNumber === null || l.logIndex === null || !l.transactionHash) continue;
    const e: IndexedEvent = {
      event: l.eventName,
      owner: args.owner.toLowerCase(),
      block: l.blockNumber.toString(),
      logIndex: l.logIndex,
      tx: l.transactionHash.toLowerCase(),
    };
    if (typeof args.triggeredBy === "string" && ADDRESS.test(args.triggeredBy)) e.triggeredBy = args.triggeredBy.toLowerCase();
    out.push(e);
  }
  return out;
}

function order(a: IndexedEvent, b: IndexedEvent): number {
  const ba = BigInt(a.block);
  const bb = BigInt(b.block);
  return ba === bb ? a.logIndex - b.logIndex : ba < bb ? -1 : 1;
}

/** Adds events (deduplicated by tx and log index) and moves the head forward, never back. */
export function mergeIndex(base: WallIndex, events: IndexedEvent[], head: bigint): WallIndex {
  const seen = new Map<string, IndexedEvent>();
  for (const e of [...base.events, ...events]) seen.set(`${e.tx}:${e.logIndex}`, e);
  const prev = BigInt(base.head);
  return { ...base, head: (head > prev ? head : prev).toString(), events: [...seen.values()].sort(order) };
}

/** Validates an index read from a file or the network; null when it is not one for this contract. */
export function parseWallIndex(raw: unknown): WallIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.contract !== "string" || r.contract.toLowerCase() !== CARD_CONTRACT.toLowerCase()) return null;
  if (r.chainId !== CHAIN_ID || typeof r.head !== "string" || !/^\d+$/.test(r.head) || !Array.isArray(r.events)) return null;
  const events: IndexedEvent[] = [];
  for (const x of r.events) {
    if (!x || typeof x !== "object") return null;
    const e = x as Record<string, unknown>;
    if (typeof e.event !== "string" || typeof e.owner !== "string" || !ADDRESS.test(e.owner)) return null;
    if (typeof e.block !== "string" || !/^\d+$/.test(e.block) || typeof e.logIndex !== "number") return null;
    if (typeof e.tx !== "string" || !HASH.test(e.tx)) return null;
    if (e.triggeredBy !== undefined && (typeof e.triggeredBy !== "string" || !ADDRESS.test(e.triggeredBy))) return null;
    const ev: IndexedEvent = { event: e.event, owner: e.owner.toLowerCase(), block: e.block, logIndex: e.logIndex, tx: e.tx.toLowerCase() };
    if (typeof e.triggeredBy === "string") ev.triggeredBy = e.triggeredBy.toLowerCase();
    events.push(ev);
  }
  return { contract: r.contract.toLowerCase(), chainId: CHAIN_ID, head: r.head, events: events.sort(order) };
}

export function scanWindows(from: bigint, to: bigint, range: bigint = LOG_WINDOW): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += range) out.push([s, s + range - 1n < to ? s + range - 1n : to]);
  return out;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("request failed");
}

/**
 * Throws when the node no longer holds logs for `block`. A pruned node answers eth_getLogs with an
 * empty list instead of an error, which would silently drop events.
 */
export async function assertLogsRetained(client: ScanClient, block: bigint): Promise<void> {
  const logs = await withRetry(() => client.getLogs({ address: RETENTION_CANARY, fromBlock: block, toBlock: block }));
  if (logs.length === 0) throw new Error(`node holds no logs at block ${block}; the index gap is older than its log history`);
}

/** Scans [from, to] for card events. Checks retention at `from` first. */
export async function scanEvents(client: ScanClient, from: bigint, to: bigint, opts: { range?: bigint; concurrency?: number } = {}): Promise<IndexedEvent[]> {
  if (from > to) return [];
  await assertLogsRetained(client, from);
  const windows = scanWindows(from, to, opts.range ?? LOG_WINDOW);
  const concurrency = opts.concurrency ?? 8;
  const out: IndexedEvent[] = [];
  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = await Promise.all(
      windows.slice(i, i + concurrency).map(([fromBlock, toBlock]) =>
        withRetry(() => client.getLogs({ address: CARD_CONTRACT as `0x${string}`, events: CARD_EVENTS, fromBlock, toBlock })),
      ),
    );
    for (const logs of batch) out.push(...toIndexedEvents(logs));
  }
  return out;
}

/** Every address that acted on the contract: card owners plus whoever triggered a pause. */
export function interactedAddresses(index: WallIndex): string[] {
  const s = new Set<string>();
  for (const e of index.events) {
    s.add(e.owner);
    if (e.triggeredBy) s.add(e.triggeredBy);
  }
  return [...s];
}
