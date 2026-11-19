import { describe, expect, it } from "vitest";
import { PRESETS, canonicalize, type ChainState } from "@apc/policy-core";
import { encodeFunctionData, maxUint256, parseAbi } from "viem";
import { runShim, type ShimDeps, type SpawnResult } from "../src/bawShim.js";
import { readAuditLines } from "../src/audit.js";
import { getEntry, setVerdict } from "../src/state.js";
import type { Config } from "../src/config.js";
import { newTmpDir } from "./helpers.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const CARD = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const NOW = 1_800_000_000_000;

const erc = parseAbi(["function approve(address spender, uint256 amount)", "function transfer(address to, uint256 amount)"]);
const cardAbi = parseAbi(["function unpause()", "function setGuardian(address g)"]);
const transferData = encodeFunctionData({ abi: erc, functionName: "transfer", args: [TOKEN, 1n] });
const approveMax = encodeFunctionData({ abi: erc, functionName: "approve", args: [TOKEN, maxUint256] });

function cfg(): Config {
  return { realBaw: "baw", wallet: WALLET, rpcUrls: ["https://rpc.example.test"], cardContract: CARD, dataDir: newTmpDir() };
}

function contractPreview(requestId: string, expiresAt = NOW + 60_000): string {
  return JSON.stringify({
    success: true,
    data: {
      requestId,
      parsedTx: {},
      simulationResult: { simulationCode: "000000000", balanceChanges: [], allowanceChanges: [], authorityChanges: [] },
      risks: { riskDetails: [], addresses: {}, riskBehaviors: [] },
      requireConfirmation: false,
      expiresAt,
    },
  });
}

type World = { chain: ChainState; paused: boolean | null; calls: string[][] };

function deps(c: Config | null, world: World, reply: (argv: string[]) => SpawnResult, now = NOW): ShimDeps {
  return {
    cfg: c,
    now: () => now,
    spawnBaw: async (argv) => {
      world.calls.push(argv);
      return reply(argv);
    },
    readChainState: async () => world.chain,
    readPaused: async () => world.paused,
  };
}

function active(paused = false): ChainState {
  return { ok: true, card: { version: 1, paused, policyText: canonicalize(PRESETS["eip712-shield"]) } };
}

const preview = (to: string, data: string) => ["contract-call", "preview", "--binanceChainId", "56", "--from", WALLET, "--to", to, "--value", "0", "--inputData", data, "--json"];
const execute = (id: string) => ["contract-call", "execute", "--requestId", id, "--json"];
const ok = (stdout: string): SpawnResult => ({ code: 0, stdout, stderr: "" });

describe("runShim preview", () => {
  it("blocks an unlimited approve and hides the requestId", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(preview(TOKEN, approveMax), deps(c, w, () => ok(contractPreview("secret-req-1"))));
    expect(r.code).toBe(3);
    expect(r.stdout).not.toContain("secret-req-1");
    expect(JSON.parse(r.stdout)).toMatchObject({ success: false, blockedBy: "agent-policy-card", reasonCode: "BLOCKED_APPROVE" });
    const lines = readAuditLines(c);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ decision: "BLOCK", reasonCode: "BLOCKED_APPROVE", requestId: null });
  });

  it("adds --json when the agent left it out", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    const argv = preview(TOKEN, transferData).slice(0, -1);
    await runShim(argv, deps(cfg(), w, () => ok(contractPreview("r"))));
    expect(w.calls[0]).toContain("--json");
  });

  it("lets a clean preview through and then executes it", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    const d = deps(c, w, (argv) => (argv[1] === "preview" ? ok(contractPreview("req-ok")) : ok('{"success":true}')));
    const p = await runShim(preview(TOKEN, transferData), d);
    expect(p.code).toBe(0);
    expect(p.stdout).toContain("req-ok");
    const e = await runShim(execute("req-ok"), d);
    expect(e.code).toBe(0);
    expect(w.calls[1]).toEqual(execute("req-ok"));
  });

  it("passes the wallet's own error output through without crashing (Review Focus 3)", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(preview(TOKEN, transferData), deps(c, w, () => ({ code: 1, stdout: "", stderr: "Developer Mode is disabled" })));
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("Developer Mode is disabled");
    expect(JSON.parse(readAuditLines(c)[0]!)).toMatchObject({ reasonCode: "MALFORMED_PREVIEW" });
  });

  it("blocks non-JSON stdout with exit 3", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(preview(TOKEN, transferData), deps(cfg(), w, () => ok("not json")));
    expect(r.code).toBe(3);
  });

  it("blocks a --from that is not the configured wallet", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    const argv = preview(TOKEN, transferData);
    argv[5] = TOKEN;
    const r = await runShim(argv, deps(cfg(), w, () => ok(contractPreview("r"))));
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).reasonCode).toBe("BLOCKED_OTHER");
    expect(w.calls).toHaveLength(0);
  });
});

describe("runShim execute (Review Focus 1 and 2)", () => {
  it("blocks a requestId that never went through the shim", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(execute("from-raw-baw"), deps(cfg(), w, () => ok("{}")));
    expect(r.code).toBe(3);
    expect(w.calls).toHaveLength(0);
  });

  it("blocks an expired requestId", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    await runShim(preview(TOKEN, transferData), deps(c, w, () => ok(contractPreview("req-exp", NOW + 1000))));
    const r = await runShim(execute("req-exp"), deps(c, w, () => ok("{}"), NOW + 2000));
    expect(r.code).toBe(3);
    expect(w.calls).toHaveLength(1);
  });

  it("blocks execute of a normal call when the card was paused after preview", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    await runShim(preview(TOKEN, transferData), deps(c, w, () => ok(contractPreview("req-p"))));
    w.paused = true;
    const r = await runShim(execute("req-p"), deps(c, w, () => ok("{}")));
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).reasonCode).toBe("AGENT_PAUSED");
  });

  it("blocks execute when the paused flag cannot be read", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    await runShim(preview(TOKEN, transferData), deps(c, w, () => ok(contractPreview("req-n"))));
    w.paused = null;
    const r = await runShim(execute("req-n"), deps(c, w, () => ok("{}")));
    expect(JSON.parse(r.stdout).reasonCode).toBe("CHAIN_READ_FAILED");
  });

  for (const [name, data] of [
    ["unpause", encodeFunctionData({ abi: cardAbi, functionName: "unpause" })],
    ["setGuardian", encodeFunctionData({ abi: cardAbi, functionName: "setGuardian", args: [TOKEN] })],
  ] as const) {
    it(`${name}: pending, then executable after confirmation even while paused`, async () => {
      const c = cfg();
      const w: World = { chain: active(true), paused: true, calls: [] };
      const d = deps(c, w, (argv) => (argv[1] === "preview" ? ok(contractPreview(`req-${name}`)) : ok('{"success":true}')));
      const p = await runShim(preview(CARD, data), d);
      expect(p.code).toBe(4);
      const body = JSON.parse(p.stdout);
      expect(body).toMatchObject({ reasonCode: "CARD_CHANGE_NEEDS_HUMAN", requestId: `req-${name}` });
      expect(body.next).toContain(`apc-confirm req-${name}`);
      expect((await runShim(execute(`req-${name}`), d)).code).toBe(3);
      setVerdict(c, `req-${name}`, "ALLOW_FOR_PREVIEW");
      const e = await runShim(execute(`req-${name}`), d);
      expect(e.code).toBe(0);
      expect(getEntry(c, `req-${name}`)?.cardCall).toBe(true);
    });
  }
});

describe("runShim other classes", () => {
  it("passes reads straight through, even without a config", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(["wallet", "balance", "--json"], deps(null, w, () => ok('{"b":1}')));
    expect(r).toEqual({ code: 0, stdout: '{"b":1}', stderr: "" });
  });

  it("blocks every write when the config is missing", async () => {
    const w: World = { chain: active(), paused: false, calls: [] };
    expect((await runShim(preview(TOKEN, transferData), deps(null, w, () => ok("{}")))).code).toBe(3);
    expect((await runShim(["wallet", "send", "--amount", "1"], deps(null, w, () => ok("{}")))).code).toBe(3);
    expect(w.calls).toHaveLength(0);
  });

  it("evaluates one-step writes before running them", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    const allowed = await runShim(["wallet", "send", "--binanceChainId", "56", "--amount", "1", "--json"], deps(c, w, () => ok('{"ok":1}')));
    expect(allowed.code).toBe(0);
    const blocked = await runShim(["defi", "deposit", "--binanceChainId", "56", "--json"], deps(c, w, () => ok("{}")));
    expect(blocked.code).toBe(3);
    w.chain = active(true);
    expect((await runShim(["wallet", "send", "--binanceChainId", "56", "--amount", "1"], deps(c, w, () => ok("{}")))).code).toBe(3);
    expect(w.calls).toHaveLength(1);
  });

  it("blocks unknown commands without running them", async () => {
    const c = cfg();
    const w: World = { chain: active(), paused: false, calls: [] };
    const r = await runShim(["wallet", "tx-lock"], deps(c, w, () => ok("{}")));
    expect(r.code).toBe(3);
    expect(JSON.parse(r.stdout).reasonCode).toBe("UNKNOWN_COMMAND");
    expect(w.calls).toHaveLength(0);
  });
});
