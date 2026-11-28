// Counts unique addresses that interacted with the card contract and how many hold an Agent ID.
// Reads the event index the live site serves, extends it toward the chain head, then checks each
// address. Fails loudly when the index is missing or too far behind; prints the counts only.
//   tsx scripts/count-holders.ts [--index <url|file>]
import { AGENT_ID, extendIndex, interactedAddresses, withRetry, type ScanClient, type WallIndex } from "@apc/policy-core";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { bsc } from "viem/chains";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { LIVE_INDEX_URL, loadIndex, logsClient } from "./index-wall.js";

const AGENT_ID_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

export type BalanceClient = {
  readContract: (p: { address: `0x${string}`; abi: typeof AGENT_ID_ABI; functionName: "balanceOf"; args: readonly [`0x${string}`] }) => Promise<bigint>;
};

export async function countHolders(index: WallIndex, client: BalanceClient, agentId: string = AGENT_ID, delayMs = 400): Promise<{ total: number; holders: number }> {
  const addrs = interactedAddresses(index);
  let holders = 0;
  for (const addr of addrs) {
    const bal = await withRetry(
      () => client.readContract({ address: agentId as `0x${string}`, abi: AGENT_ID_ABI, functionName: "balanceOf", args: [addr as `0x${string}`] }),
      { delayMs },
    );
    if (bal > 0n) holders++;
  }
  return { total: addrs.length, holders };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { index: { type: "string" } }, strict: true });
  const source = values.index ?? LIVE_INDEX_URL;
  const base = await loadIndex(source);
  if (!base) throw new Error(`no valid index at ${source}`);
  const logs = logsClient();
  const index = await extendIndex(base, logs as unknown as ScanClient, await logs.getBlockNumber());
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
