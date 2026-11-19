// Public read-only client for BSC. The static site never connects an Agentic Wallet.
import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";

export const RPC_URLS = ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"];

export const publicClient = createPublicClient({
  chain: bsc,
  transport: fallback(RPC_URLS.map((u) => http(u, { timeout: 6_000 }))),
});
