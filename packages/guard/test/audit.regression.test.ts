// Regression tests for findings of the independent guard audit (guard-audit-1).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRESETS, canonicalize, type ChainState } from "@apc/policy-core";
import { classify } from "../src/commands.js";
import { runShim, type SpawnResult } from "../src/bawShim.js";
import { putEntry, getEntry } from "../src/state.js";
import type { Config } from "../src/config.js";
import { newTmpDir } from "./helpers.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";
const NOW = 1_800_000_000_000;
const cfg = (): Config => ({ realBaw: "baw", wallet: WALLET, rpcUrls: ["https://rpc.example.test"], cardContract: "0x2222222222222222222222222222222222222222", dataDir: newTmpDir() });
const chain: ChainState = { ok: true, card: { version: 1, paused: false, policyText: canonicalize(PRESETS["eip712-shield"]) } };

function shim(c: Config, reply: (argv: string[]) => SpawnResult, calls: string[][] = []) {
  return {
    cfg: c,
    now: () => NOW,
    spawnBaw: async (argv: string[]) => {
      calls.push(argv);
      return reply(argv);
    },
    readChainState: async () => chain,
    readPaused: async () => false,
  };
}

const preview = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    success: true,
    data: {
      requestId: "r-1",
      parsedTx: {},
      simulationResult: { simulationCode: "000000000", balanceChanges: [], allowanceChanges: [], authorityChanges: [] },
      risks: { riskDetails: [], addresses: {}, riskBehaviors: [] },
      expiresAt: NOW + 60_000,
      ...extra,
    },
  });
const okJson = (s: string): SpawnResult => ({ code: 0, stdout: s, stderr: "" });
const cc = (more: string[] = []) => ["contract-call", "preview", "--binanceChainId", "56", "--from", WALLET, "--to", OTHER, "--value", "0", "--inputData", "0x", ...more, "--json"];

describe("classify flag schema", () => {
  it.each([
    [["contract-call", "preview", "--input-data", "0x"]],
    [["contract-call", "preview", "--inputdata", "0x", "--inputData", "0x"]],
    [["contract-call", "preview", "--To", OTHER]],
    [["contract-call", "execute", "--requestId", "r", "--", "--x"]],
    [["contract-call", "execute", "--requestId", "r", "-r", "q"]],
    [["contract-call", "execute", "--json", "extra"]],
    [["sign-message", "preview", "--message", "{}", "--from", WALLET]],
  ])("rejects %j", (argv) => {
    expect(classify(argv).cls).toBe("unknown");
  });

  it("accepts the documented flags", () => {
    expect(classify(cc(["--gasLimit", "50000"])).cls).toBe("preview");
    expect(classify(["sign-message", "preview", "--binanceChainId", "56", "--signType", "EIP712", "--message", "{}", "--json"]).cls).toBe("preview");
    expect(classify(["contract-call", "execute", "--requestId", "r", "--json"]).cls).toBe("execute");
  });

  it("wallet speed-up is guarded, not a read", () => {
    expect(classify(["wallet", "speed-up", "--binanceChainId", "56"]).cls).toBe("write-1step");
  });
});

describe("runShim audit fixes", () => {
  it("contract-call preview requires --from", async () => {
    const argv = cc().filter((a, i, all) => a !== "--from" && all[i - 1] !== "--from");
    const calls: string[][] = [];
    const r = await runShim(argv, shim(cfg(), () => okJson(preview()), calls));
    expect(r.code).toBe(3);
    expect(calls).toHaveLength(0);
  });

  it("sign-message signer must be the guarded wallet", async () => {
    const td = JSON.stringify({ domain: { name: "Mail", chainId: 56, verifyingContract: OTHER }, primaryType: "Mail", message: {} });
    const argv = ["sign-message", "preview", "--binanceChainId", "56", "--signType", "EIP712", "--message", JSON.stringify({ method: "eth_signTypedData_v4", params: [OTHER, td] }), "--json"];
    const calls: string[][] = [];
    const r = await runShim(argv, shim(cfg(), () => okJson("{}"), calls));
    expect(JSON.parse(r.stdout).reasonCode).toBe("BLOCKED_OTHER");
    expect(calls).toHaveLength(0);
  });

  it("execute runs a canonical argv", async () => {
    const c = cfg();
    putEntry(c, { requestId: "r-9", verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", cardCall: false, expiresAt: NOW + 1000, intentHash: "h", command: "contract-call" }, NOW);
    const calls: string[][] = [];
    await runShim(["contract-call", "execute", "--json", "--requestId", "r-9"], shim(c, () => okJson("{}"), calls));
    expect(calls[0]).toEqual(["contract-call", "execute", "--requestId", "r-9", "--json"]);
  });

  it("a requestId from sign-message cannot be executed as a contract call", async () => {
    const c = cfg();
    putEntry(c, { requestId: "r-s", verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", cardCall: false, expiresAt: NOW + 1000, intentHash: "h", command: "sign-message" }, NOW);
    const r = await runShim(["contract-call", "execute", "--requestId", "r-s", "--json"], shim(c, () => okJson("{}")));
    expect(r.code).toBe(3);
  });

  it("a wallet refusal never leaks a requestId", async () => {
    const r = await runShim(cc(), shim(cfg(), () => okJson(JSON.stringify({ success: false, data: { requestId: "leak-me" }, error: { code: 1, message: "nope" } }))));
    expect(r.code).toBe(3);
    expect(r.stdout + r.stderr).not.toContain("leak-me");
  });

  it.each([[1e309], [NOW - 1], ["soon"]])("rejects expiresAt %s", async (expiresAt) => {
    const c = cfg();
    const r = await runShim(cc(), shim(c, () => okJson(preview({ expiresAt }))));
    expect(r.code).toBe(3);
    expect(getEntry(c, "r-1")).toBeNull();
  });

  it("maps any wallet error exit code to 3, never to the pending code 4", async () => {
    const r = await runShim(cc(), shim(cfg(), () => ({ code: 4, stdout: "", stderr: "boom" })));
    expect(r.code).toBe(3);
    expect(r.stderr).toContain("boom");
  });

  it("an empty state.key is replaced instead of crashing", () => {
    const c = cfg();
    writeFileSync(join(c.dataDir, "state.key"), "");
    putEntry(c, { requestId: "k", verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", cardCall: false, expiresAt: NOW + 1000, intentHash: "h" }, NOW);
    expect(getEntry(c, "k")?.requestId).toBe("k");
  });
});
