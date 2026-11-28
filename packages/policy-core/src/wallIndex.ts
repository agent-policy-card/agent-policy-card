// Event index for the card contract. Free public BSC RPCs keep only about a day of logs and cap
// eth_getLogs ranges, so a scheduled job carries the index forward and the site reads it as a
// static file, then scans only the recent tail itself. Addresses come only from chain data.
import { CARD_CONTRACT, CHAIN_ID, DEPLOY_BLOCK } from "./deployment.js";
import { CARD_ABI } from "./selectors.js";

export const LOG_WINDOW = 10_000n;
/**
 * Largest gap a scan may cover. Public nodes were measured holding 100k to 200k blocks of logs and
 * answer older ranges with an empty list, so scans stay far from that edge and fail instead.
 */
export const MAX_SAFE_GAP = 60_000n;
/** Blocks left unindexed behind the tip, so shallow reorgs and lagging nodes cannot drop events. */
export const CONFIRMATIONS = 64n;
/** Busy BEP-20 contract (BSC USDT) used to check that a node still holds logs for a range. */
export const RETENTION_CANARY = "0x55d398326f99059fF775485246999027B3197955";
const CANARY_SPAN = 5n;

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
const EVENT_NAMES = new Set<string>(CARD_EVENTS.map((e) => e.name));

/** viem's PublicClient fits this shape; `events` asks it to decode the card events. */
export type ScanClient = {
  getLogs: (p: { address: `0x${string}`; fromBlock: bigint; toBlock: bigint; events?: typeof CARD_EVENTS }) => Promise<LogLike[]>;
};

export type RetryOptions = { attempts?: number; delayMs?: number };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d+$/;

export function emptyIndex(head: bigint): WallIndex {
  return { contract: CARD_CONTRACT.toLowerCase(), chainId: CHAIN_ID, head: head.toString(), events: [] };
}

function normalize(e: IndexedEvent): IndexedEvent {
  const out: IndexedEvent = { event: e.event, owner: e.owner.toLowerCase(), block: e.block, logIndex: e.logIndex, tx: e.tx.toLowerCase() };
  if (e.triggeredBy) out.triggeredBy = e.triggeredBy.toLowerCase();
  return out;
}

export function toIndexedEvents(logs: LogLike[]): IndexedEvent[] {
  const out: IndexedEvent[] = [];
  for (const l of logs) {
    const args = (l.args ?? {}) as Record<string, unknown>;
    if (!l.eventName || !EVENT_NAMES.has(l.eventName) || typeof args.owner !== "string" || !ADDRESS.test(args.owner)) continue;
    if (l.blockNumber === null || l.logIndex === null || !l.transactionHash) continue;
    const e: IndexedEvent = { event: l.eventName, owner: args.owner, block: l.blockNumber.toString(), logIndex: l.logIndex, tx: l.transactionHash };
    if (typeof args.triggeredBy === "string" && ADDRESS.test(args.triggeredBy)) e.triggeredBy = args.triggeredBy;
    out.push(normalize(e));
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
  for (const e of [...base.events, ...events].map(normalize)) seen.set(`${e.tx}:${e.logIndex}`, e);
  const prev = BigInt(base.head);
  return { ...base, head: (head > prev ? head : prev).toString(), events: [...seen.values()].sort(order) };
}

/** Validates an index read from a file or the network; null when it is not a plausible index for this contract. */
export function parseWallIndex(raw: unknown): WallIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.contract !== "string" || r.contract.toLowerCase() !== CARD_CONTRACT.toLowerCase()) return null;
  if (r.chainId !== CHAIN_ID || typeof r.head !== "string" || !UINT.test(r.head) || !Array.isArray(r.events)) return null;
  const head = BigInt(r.head);
  if (head < DEPLOY_BLOCK - 1n) return null;
  const events: IndexedEvent[] = [];
  for (const x of r.events) {
    if (!x || typeof x !== "object") return null;
    const e = x as Record<string, unknown>;
    if (typeof e.event !== "string" || !EVENT_NAMES.has(e.event)) return null;
    if (typeof e.owner !== "string" || !ADDRESS.test(e.owner)) return null;
    if (typeof e.block !== "string" || !UINT.test(e.block) || BigInt(e.block) < DEPLOY_BLOCK || BigInt(e.block) > head) return null;
    if (typeof e.logIndex !== "number" || !Number.isInteger(e.logIndex) || e.logIndex < 0) return null;
    if (typeof e.tx !== "string" || !HASH.test(e.tx)) return null;
    if (e.triggeredBy !== undefined && (typeof e.triggeredBy !== "string" || !ADDRESS.test(e.triggeredBy))) return null;
    const ev: IndexedEvent = { event: e.event, owner: e.owner, block: e.block, logIndex: e.logIndex, tx: e.tx };
    if (typeof e.triggeredBy === "string") ev.triggeredBy = e.triggeredBy;
    events.push(ev);
  }
  return mergeIndex(emptyIndex(head), events, head);
}

export function scanWindows(from: bigint, to: bigint, range: bigint = LOG_WINDOW): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let s = from; s <= to; s += range) out.push([s, s + range - 1n < to ? s + range - 1n : to]);
  return out;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delay = opts.delayMs ?? 400;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts - 1 && delay > 0) await new Promise((r) => setTimeout(r, delay * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error("request failed");
}

/**
 * Throws when the node holds no logs at `block`. A pruned node answers eth_getLogs with an empty
 * list instead of an error, which would silently drop events.
 */
export async function assertLogsRetained(client: ScanClient, block: bigint, retry: RetryOptions = {}): Promise<void> {
  const logs = await withRetry(() => client.getLogs({ address: RETENTION_CANARY, fromBlock: block, toBlock: block + CANARY_SPAN - 1n }), retry);
  if (logs.length === 0) throw new Error(`node holds no logs at block ${block}; rebuild the index from a seed`);
}

/** Scans [from, to] for card events, checking at the start of every window that the node still holds logs. */
export async function scanEvents(
  client: ScanClient,
  from: bigint,
  to: bigint,
  opts: { range?: bigint; concurrency?: number; retry?: RetryOptions } = {},
): Promise<IndexedEvent[]> {
  if (from > to) return [];
  if (to - from + 1n > MAX_SAFE_GAP) throw new Error(`gap of ${to - from + 1n} blocks is too close to public log history; rebuild the index from a seed`);
  const windows = scanWindows(from, to, opts.range ?? LOG_WINDOW);
  const concurrency = opts.concurrency ?? 4;
  const out: IndexedEvent[] = [];
  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = await Promise.all(
      windows.slice(i, i + concurrency).map(async ([fromBlock, toBlock]) => {
        await assertLogsRetained(client, fromBlock, opts.retry);
        return withRetry(() => client.getLogs({ address: CARD_CONTRACT as `0x${string}`, events: CARD_EVENTS, fromBlock, toBlock }), opts.retry);
      }),
    );
    for (const logs of batch) out.push(...toIndexedEvents(logs));
  }
  return out;
}

/** Extends the index to `chainHead - CONFIRMATIONS`. Throws when the index claims a head beyond the chain. */
export async function extendIndex(
  base: WallIndex,
  client: ScanClient,
  chainHead: bigint,
  opts: { range?: bigint; concurrency?: number; retry?: RetryOptions } = {},
): Promise<WallIndex> {
  const from = BigInt(base.head) + 1n;
  if (from - 1n > chainHead) throw new Error(`index head ${base.head} is ahead of the chain head ${chainHead}`);
  const target = chainHead - CONFIRMATIONS;
  if (target < from) return base;
  return mergeIndex(base, await scanEvents(client, from, target, opts), target);
}

/** Every address that acted on the contract: card owners plus whoever triggered a pause. */
export function interactedAddresses(index: WallIndex): string[] {
  const s = new Set<string>();
  for (const e of index.events) {
    s.add(e.owner.toLowerCase());
    if (e.triggeredBy) s.add(e.triggeredBy.toLowerCase());
  }
  return [...s];
}
