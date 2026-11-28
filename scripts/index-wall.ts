// Carries the card event index forward to the chain head and writes it for the site.
// Free public RPCs keep only about a day of logs, so each scheduled run starts from the index the
// live site already serves and scans only the new blocks.
//   tsx scripts/index-wall.ts [--previous <url|file>] [--out <file>]
// Bootstrap or recovery (no usable previous index, or it fell behind the node's log history):
// list every transaction to the card contract from the explorer, then pass
//   --seed-head <block at or before the moment the list was read> --seed-txs "<hash> <hash> ..."
// The seed is built from receipts and never written to the repository.
import {
  CARD_ABI,
  CARD_CONTRACT,
  emptyIndex,
  mergeIndex,
  parseWallIndex,
  scanEvents,
  toIndexedEvents,
  type LogLike,
  type ScanClient,
  type WallIndex,
} from "@apc/policy-core";
import { createPublicClient, http, parseEventLogs } from "viem";
import { bsc } from "viem/chains";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_INDEX_URL = "https://agent-policy-card.github.io/agent-policy-card/wall-index.json";
export const LOGS_RPC = "https://bsc-rpc.publicnode.com";
// Full node that still serves receipts for older blocks without a token.
export const RECEIPT_RPC = "https://bsc-dataseed.bnbchain.org";

/** Reads an index from a URL or a file; null when it is missing or not a valid index. */
export async function loadIndex(source: string): Promise<WallIndex | null> {
  try {
    const raw = /^https?:\/\//.test(source)
      ? await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null))
      : JSON.parse(readFileSync(source, "utf8"));
    return parseWallIndex(raw);
  } catch {
    return null;
  }
}

export type ReceiptClient = { getTransactionReceipt: (p: { hash: `0x${string}` }) => Promise<{ blockNumber: bigint; logs: { address: string }[] }> };

/** Builds an index up to `head` from the receipts of the given transactions. */
export async function buildSeed(client: ReceiptClient, head: bigint, hashes: string[]): Promise<WallIndex> {
  if (hashes.length === 0 || !hashes.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))) throw new Error("seed needs at least one valid transaction hash");
  const logs: LogLike[] = [];
  for (const hash of hashes) {
    const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (r.blockNumber > head) throw new Error(`${hash} is after the seed head`);
    const own = r.logs.filter((l) => l.address.toLowerCase() === CARD_CONTRACT.toLowerCase());
    logs.push(...(parseEventLogs({ abi: CARD_ABI, logs: own as never }) as unknown as LogLike[]));
  }
  return mergeIndex(emptyIndex(head), toIndexedEvents(logs), head);
}

/** The newer of the available indexes. */
export function pickBase(...candidates: (WallIndex | null)[]): WallIndex {
  const best = candidates.filter((x): x is WallIndex => x !== null).sort((a, b) => (BigInt(b.head) > BigInt(a.head) ? 1 : BigInt(b.head) < BigInt(a.head) ? -1 : 0))[0];
  if (!best) throw new Error("no previous index: bootstrap with --seed-head and --seed-txs");
  return best;
}

export async function extendToHead(base: WallIndex, client: ScanClient, head: bigint): Promise<WallIndex> {
  const events = await scanEvents(client, BigInt(base.head) + 1n, head);
  return mergeIndex(base, events, head);
}

export function logsClient(url = LOGS_RPC) {
  return createPublicClient({ chain: bsc, transport: http(url, { timeout: 15_000, retryCount: 1 }) });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const out = arg("--out") ?? "apps/web/public/wall-index.json";
  const previous = await loadIndex(arg("--previous") ?? LIVE_INDEX_URL);
  const seedHead = arg("--seed-head")?.trim();
  const seedTxs = (arg("--seed-txs") ?? "").split(/[\s,]+/).filter(Boolean);
  let seed: WallIndex | null = null;
  if (seedHead || seedTxs.length > 0) {
    if (!seedHead || !/^\d+$/.test(seedHead)) throw new Error("--seed-head must be a block number");
    seed = await buildSeed(createPublicClient({ chain: bsc, transport: http(RECEIPT_RPC, { timeout: 15_000 }) }) as unknown as ReceiptClient, BigInt(seedHead), seedTxs);
  }
  const base = pickBase(previous, seed);
  const client = logsClient();
  const head = await client.getBlockNumber();
  const next = await extendToHead(base, client as unknown as ScanClient, head);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(next) + "\n");
  console.log(`indexed blocks ${BigInt(base.head) + 1n}..${head}: ${next.events.length} events (${next.events.length - base.events.length} new)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
