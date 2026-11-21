// Entry point for apc-attest and apc-attest proof <periodEnd> <index>. Prints only; never signs or sends.
import { CARD_ABI } from "@apc/policy-core";
import { createPublicClient, fallback, http } from "viem";
import { buildAttestation, proofFor, saveAttestationFile } from "../src/attest.js";
import { ATTEST_USAGE, parseAttestArgs } from "../src/attestArgs.js";
import { readAuditLines } from "../src/audit.js";
import { loadConfig } from "../src/config.js";
import { RPC_TIMEOUT_MS } from "../src/chain.js";

async function main(): Promise<void> {
  const args = parseAttestArgs(process.argv.slice(2));
  if (args.mode === "usage") {
    if (args.error !== null) process.stderr.write(`apc-attest: ${args.error}\n`);
    process.stdout.write(ATTEST_USAGE);
    process.exitCode = args.error === null ? 0 : 2;
    return;
  }
  const cfg = loadConfig();
  if (args.mode === "proof") {
    process.stdout.write(`${JSON.stringify(proofFor(cfg.dataDir, args.periodEnd, args.index))}\n`);
    return;
  }
  const client = createPublicClient({
    transport: fallback(cfg.rpcUrls.map((u) => http(u, { timeout: RPC_TIMEOUT_MS, retryCount: 0 }))),
  });
  const latest = await client.readContract({
    address: cfg.cardContract as `0x${string}`,
    abi: CARD_ABI,
    functionName: "getLatestAttestation",
    args: [cfg.wallet as `0x${string}`],
  });
  const prev = latest.epoch === 0 ? null : { periodEnd: Number(latest.periodEnd) };
  const b = buildAttestation(readAuditLines(cfg), prev, Math.floor(Date.now() / 1000), cfg.cardContract);
  if (b.calldata === null || b.prompt === null) {
    process.stdout.write("Nothing to attest\n");
    return;
  }
  const path = saveAttestationFile(cfg.dataDir, b);
  process.stdout.write(`${JSON.stringify(b.counts)}\n`);
  process.stdout.write(`Saved ${path}\n\n${b.prompt}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`apc-attest: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
