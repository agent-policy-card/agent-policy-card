// Counts unique addresses that interacted with the card contract (from its events) and how many
// of them hold an Agent ID. Uses public RPC getLogs in block chunks; prints two numbers only.
import { AGENT_ID, CARD_ABI, CARD_CONTRACT, DEPLOY_BLOCK } from "@apc/policy-core";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { fileURLToPath } from "node:url";

const AGENT_ID_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const EVENTS = CARD_ABI.filter((x) => x.type === "event");

type Log = { eventName?: string; args?: Record<string, unknown> };
export type HolderClient = {
  getLogs: (p: { address: `0x${string}`; events: typeof EVENTS; fromBlock: bigint; toBlock: bigint }) => Promise<Log[]>;
  readContract: (p: { address: `0x${string}`; abi: typeof AGENT_ID_ABI; functionName: "balanceOf"; args: readonly [`0x${string}`] }) => Promise<bigint>;
};
export type CountOptions = { cardContract: string; agentId: string; fromBlock: bigint; toBlock: bigint; chunk: bigint };

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

export async function countHolders(client: HolderClient, o: CountOptions): Promise<{ total: number; holders: number }> {
  const seen = new Set<string>();
  for (let start = o.fromBlock; start <= o.toBlock; start += o.chunk) {
    const end = start + o.chunk - 1n < o.toBlock ? start + o.chunk - 1n : o.toBlock;
    const logs = await withRetry(() =>
      client.getLogs({ address: o.cardContract as `0x${string}`, events: EVENTS, fromBlock: start, toBlock: end }),
    );
    for (const log of logs) {
      for (const key of ["owner", "triggeredBy"]) {
        const v = log.args?.[key];
        if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) seen.add(v.toLowerCase());
      }
    }
  }
  let holders = 0;
  for (const addr of seen) {
    const bal = await withRetry(() =>
      client.readContract({ address: o.agentId as `0x${string}`, abi: AGENT_ID_ABI, functionName: "balanceOf", args: [addr as `0x${string}`] }),
    );
    if (bal > 0n) holders++;
  }
  return { total: seen.size, holders };
}

async function main(): Promise<void> {
  const urls = ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"];
  const client = createPublicClient({ transport: fallback(urls.map((u) => http(u, { timeout: 10_000 }))) });
  const toBlock = await client.getBlockNumber();
  const r = await countHolders(client as unknown as HolderClient, {
    cardContract: CARD_CONTRACT,
    agentId: AGENT_ID,
    fromBlock: DEPLOY_BLOCK,
    toBlock,
    chunk: 5000n,
  });
  console.log(`addresses that interacted: ${r.total}`);
  console.log(`of which hold an Agent ID: ${r.holders}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
