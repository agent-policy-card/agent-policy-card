// Carries the card event index forward and writes it for the site.
// Free public RPCs keep only about a day of logs, so each scheduled run starts from the newest
// index it can find (the CI cache, then the live site) and scans only the new blocks.
//   tsx scripts/index-wall.ts [--previous <url|file>] [--cache <file>] [--out <file>]
// Bootstrap or recovery (no usable index, or it fell too far behind): list every transaction to
// the card contract from the explorer, then set SEED_HEAD (a block at or before the moment the
// list was read) and SEED_TXS (the hashes, space separated) in the environment. An explicit seed
// replaces any previous index. It is built from receipts and never written to the repository.
import { CARD_ABI, CARD_CONTRACT, emptyIndex, extendIndex, mergeIndex, parseWallIndex, toIndexedEvents, type LogLike, type ScanClient, type WallIndex } from "@apc/policy-core";
import { createPublicClient, http, parseEventLogs } from "viem";
import { bsc } from "viem/chains";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const LIVE_INDEX_URL = "https://agent-policy-card.github.io/agent-policy-card/wall-index.json";
export const LOGS_RPC = "https://bsc-rpc.publicnode.com";
// Full node that still serves receipts for older blocks without a token.
export const RECEIPT_RPC = "https://bsc-dataseed.bnbchain.org";

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Reads an index from a URL or a file; null when it is missing or not a valid index. */
export async function loadIndex(source: string, fetcher: Fetcher = (u) => fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15_000) })): Promise<WallIndex | null> {
  try {
    if (/^https?:\/\//.test(source)) {
      const res = await fetcher(source);
      return res.ok ? parseWallIndex(await res.json()) : null;
    }
    if (!existsSync(source)) return null;
    return parseWallIndex(JSON.parse(readFileSync(source, "utf8")));
  } catch {
    return null;
  }
}

export type ReceiptClient = { getTransactionReceipt: (p: { hash: `0x${string}` }) => Promise<{ blockNumber: bigint; logs: { address: string; topics: readonly string[]; data: string }[] }> };

/** Builds an index up to `head` from the receipts of the given transactions (none for a contract with no activity yet). */
export async function buildSeed(client: ReceiptClient, head: bigint, hashes: string[]): Promise<WallIndex> {
  if (!hashes.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))) throw new Error("seed transactions must be 32-byte hashes");
  const logs: LogLike[] = [];
  for (const hash of hashes) {
    const r = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    if (r.blockNumber > head) throw new Error(`${hash} is after the seed head`);
    const own = r.logs.filter((l) => l.address.toLowerCase() === CARD_CONTRACT.toLowerCase());
    logs.push(...(parseEventLogs({ abi: CARD_ABI, logs: own as never }) as unknown as LogLike[]));
  }
  return mergeIndex(emptyIndex(head), toIndexedEvents(logs), head);
}

/** The newest of the available indexes. */
export function pickBase(...candidates: (WallIndex | null)[]): WallIndex {
  const found = candidates.filter((x): x is WallIndex => x !== null);
  if (found.length === 0) throw new Error("no previous index: bootstrap with SEED_HEAD and SEED_TXS");
  return found.reduce((a, b) => (BigInt(b.head) > BigInt(a.head) ? b : a));
}

/** Reads the seed request from the environment; null when none was given. */
export function seedRequest(env: NodeJS.ProcessEnv): { head: bigint; hashes: string[] } | null {
  const head = (env.SEED_HEAD ?? "").trim();
  const txs = (env.SEED_TXS ?? "").trim();
  if (!head && !txs) return null;
  if (!/^\d+$/.test(head)) throw new Error("SEED_HEAD must be a block number when SEED_TXS is given");
  return { head: BigInt(head), hashes: txs.split(/[\s,]+/).filter(Boolean) };
}

export function logsClient(url = LOGS_RPC) {
  return createPublicClient({ chain: bsc, transport: http(url, { timeout: 15_000, retryCount: 0 }) });
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { previous: { type: "string" }, cache: { type: "string" }, out: { type: "string" } },
    strict: true,
  });
  const out = values.out ?? "apps/web/public/wall-index.json";
  const seed = seedRequest(process.env);
  const base = seed
    ? await buildSeed(createPublicClient({ chain: bsc, transport: http(RECEIPT_RPC, { timeout: 15_000 }) }) as unknown as ReceiptClient, seed.head, seed.hashes)
    : pickBase(await loadIndex(values.previous ?? LIVE_INDEX_URL), values.cache ? await loadIndex(values.cache) : null);
  const client = logsClient();
  const next = await extendIndex(base, client as unknown as ScanClient, await client.getBlockNumber());
  const body = JSON.stringify(next) + "\n";
  for (const file of [out, values.cache].filter((f): f is string => Boolean(f))) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  console.log(`${seed ? "seeded" : "extended"} index: blocks ${BigInt(base.head) + 1n}..${next.head}, ${next.events.length} events (${next.events.length - base.events.length} new)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
