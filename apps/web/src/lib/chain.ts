// Public read-only client for BSC. The static site never connects an Agentic Wallet.
import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";

// publicnode first: it serves browser origins and eth_getLogs up to 50,000 blocks; bsc-dataseed refuses getLogs.
export const RPC_URLS = ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"];
export const LOGS_RPC_URL = "https://bsc-rpc.publicnode.com";
export const LOGS_MAX_RANGE = 50_000n;

export const publicClient = createPublicClient({
  chain: bsc,
  transport: fallback(RPC_URLS.map((u) => http(u, { timeout: 6_000 }))),
});

/** Single-endpoint client for event scans, so a node that refuses getLogs is never tried. */
export const logsClient = createPublicClient({
  chain: bsc,
  transport: http(LOGS_RPC_URL, { timeout: 12_000, retryCount: 1 }),
});
