// Counts unique addresses that interacted with the card contract and how many hold an Agent ID.
// Reads the event index the live site serves, extends it to the chain head, then checks each
// address. Fails loudly when the index is missing or too far behind; prints two numbers only.
//   tsx scripts/count-holders.ts [--index <url|file>]
import { AGENT_ID, interactedAddresses, type ScanClient, type WallIndex } from "@apc/policy-core";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { fileURLToPath } from "node:url";
import { LIVE_INDEX_URL, extendToHead, loadIndex, logsClient } from "./index-wall.js";

const AGENT_ID_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

export type BalanceClient = {
  readContract: (p: { address: `0x${string}`; abi: typeof AGENT_ID_ABI; functionName: "balanceOf"; args: readonly [`0x${string}`] }) => Promise<bigint>;
};

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

export async function countHolders(index: WallIndex, client: BalanceClient, agentId: string = AGENT_ID): Promise<{ total: number; holders: number }> {
  const addrs = interactedAddresses(index);
  let holders = 0;
  for (const addr of addrs) {
    const bal = await withRetry(() =>
      client.readContract({ address: agentId as `0x${string}`, abi: AGENT_ID_ABI, functionName: "balanceOf", args: [addr as `0x${string}`] }),
    );
    if (bal > 0n) holders++;
  }
  return { total: addrs.length, holders };
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--index");
  const source = i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : LIVE_INDEX_URL;
  const base = await loadIndex(source);
  if (!base) throw new Error(`no valid index at ${source}`);
  const logs = logsClient();
  const index = await extendToHead(base, logs as unknown as ScanClient, await logs.getBlockNumber());
  const urls = ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"];
  const reader = createPublicClient({ chain: bsc, transport: fallback(urls.map((u) => http(u, { timeout: 10_000 }))) });
  const r = await countHolders(index, reader as unknown as BalanceClient);
  console.log(`indexed to block ${index.head}`);
  console.log(`addresses that interacted: ${r.total}`);
  console.log(`of which hold an Agent ID: ${r.holders}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
