import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_ABI } from "@apc/policy-core";
import { decodeFunctionData, encodeFunctionResult } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLICY_CACHE_MS, readChainState, readPaused } from "../src/chain.js";
import { makeConfig, newTmpDir, PLACEHOLDER } from "./helpers.js";

const calls = { getCard: 0, isPaused: 0 };
let failUrls: string[] = [];
let card = { version: 3, paused: false, policyText: '{"v":1}' };

function cardResult(): string {
  return encodeFunctionResult({
    abi: CARD_ABI,
    functionName: "getCard",
    result: {
      policyHash: `0x${"00".repeat(32)}`,
      policyText: card.policyText,
      guardian: PLACEHOLDER,
      version: card.version,
      paused: card.paused,
      updatedAt: 0n,
      pausedAt: 0n,
    },
  });
}

function answer(req: { id: number; method: string; params: { data?: string }[] }) {
  if (req.method !== "eth_call") return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "no" } };
  const { functionName } = decodeFunctionData({ abi: CARD_ABI, data: req.params[0]!.data as `0x${string}` });
  if (functionName === "getCard") {
    calls.getCard++;
    return { jsonrpc: "2.0", id: req.id, result: cardResult() };
  }
  calls.isPaused++;
  return {
    jsonrpc: "2.0",
    id: req.id,
    result: encodeFunctionResult({ abi: CARD_ABI, functionName: "isPaused", result: card.paused }),
  };
}

beforeEach(() => {
  calls.getCard = 0;
  calls.isPaused = 0;
  failUrls = [];
  card = { version: 3, paused: false, policyText: '{"v":1}' };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init: { body: string }) => {
      const url = String((input as { url?: string }).url ?? input);
      if (failUrls.some((u) => url.startsWith(u))) return new Response("boom", { status: 500 });
      const body = JSON.parse(init.body);
      const out = Array.isArray(body) ? body.map(answer) : answer(body);
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("readChainState", () => {
  it("falls back to the second url when the first returns 500", async () => {
    const cfg = makeConfig(newTmpDir());
    failUrls = ["https://rpc1.example.test"];
    const r = await readChainState(cfg, PLACEHOLDER);
    expect(r).toEqual({ ok: true, card: { version: 3, paused: false, policyText: '{"v":1}' } });
  });

  it("returns ok:false when every url fails", async () => {
    const cfg = makeConfig(newTmpDir());
    failUrls = ["https://rpc1.example.test", "https://rpc2.example.test"];
    expect(await readChainState(cfg, PLACEHOLDER)).toEqual({ ok: false });
  });

  it("returns card null for version 0 and does not cache it", async () => {
    const cfg = makeConfig(newTmpDir());
    card = { version: 0, paused: false, policyText: "" };
    expect(await readChainState(cfg, PLACEHOLDER)).toEqual({ ok: true, card: null });
    await readChainState(cfg, PLACEHOLDER);
    expect(calls.getCard).toBe(2);
  });

  it("caches the policy for 30s and refreshes paused each time", async () => {
    const cfg = makeConfig(newTmpDir());
    const t0 = 1_000_000;
    await readChainState(cfg, PLACEHOLDER, { now: () => t0 });
    card.paused = true;
    const r = await readChainState(cfg, PLACEHOLDER, { now: () => t0 + 10_000 });
    expect(r).toEqual({ ok: true, card: { version: 3, paused: true, policyText: '{"v":1}' } });
    expect(calls.getCard).toBe(1);
    expect(calls.isPaused).toBe(1);
  });

  it("calls getCard again after 31s", async () => {
    const cfg = makeConfig(newTmpDir());
    const t0 = 1_000_000;
    await readChainState(cfg, PLACEHOLDER, { now: () => t0 });
    await readChainState(cfg, PLACEHOLDER, { now: () => t0 + POLICY_CACHE_MS + 1_000 });
    expect(calls.getCard).toBe(2);
  });

  it("ignores a corrupt cache.json", async () => {
    const cfg = makeConfig(newTmpDir());
    writeFileSync(join(cfg.dataDir, "cache.json"), "{{not json");
    const r = await readChainState(cfg, PLACEHOLDER);
    expect(r.ok).toBe(true);
  });
});

describe("readPaused", () => {
  it("returns the mock value", async () => {
    const cfg = makeConfig(newTmpDir());
    card.paused = true;
    expect(await readPaused(cfg, PLACEHOLDER)).toBe(true);
    card.paused = false;
    expect(await readPaused(cfg, PLACEHOLDER)).toBe(false);
  });

  it("returns null when every url fails", async () => {
    const cfg = makeConfig(newTmpDir());
    failUrls = ["https://rpc1.example.test", "https://rpc2.example.test"];
    expect(await readPaused(cfg, PLACEHOLDER)).toBeNull();
  });
});
