import { describe, expect, it } from "vitest";
import {
  CARD_CONTRACT,
  CONFIRMATIONS,
  DEPLOY_BLOCK,
  MAX_SAFE_GAP,
  RETENTION_CANARY,
  emptyIndex,
  extendIndex,
  interactedAddresses,
  mergeIndex,
  parseWallIndex,
  scanEvents,
  scanWindows,
  withRetry,
  type LogLike,
  type ScanClient,
} from "../src/index.js";

const A = "0x3333333333333333333333333333333333333333";
const G = "0x1111111111111111111111111111111111111111";
const D = DEPLOY_BLOCK;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const log = (eventName: string, args: Record<string, unknown>, block: bigint, logIndex: number, t: number): LogLike => ({ eventName, args, blockNumber: block, logIndex, transactionHash: tx(t) });
const fast = { retry: { delayMs: 0 } };

type Opts = { prunedBelow?: bigint; fail?: Record<string, number> };
function client(cardLogs: Record<string, LogLike[]>, opts: Opts = {}): ScanClient & { calls: string[]; canary: bigint[] } {
  const calls: string[] = [];
  const canary: bigint[] = [];
  return {
    calls,
    canary,
    getLogs: async ({ address, fromBlock, toBlock }) => {
      if (address === RETENTION_CANARY) {
        canary.push(fromBlock);
        return opts.prunedBelow !== undefined && fromBlock < opts.prunedBelow ? [] : [log("Transfer", {}, fromBlock, 0, 999)];
      }
      const key = `${fromBlock - D}-${toBlock - D}`;
      calls.push(key);
      if ((opts.fail?.[key] ?? 0) > 0) {
        opts.fail![key]!--;
        throw new Error("rpc");
      }
      return cardLogs[key] ?? [];
    },
  };
}

describe("scanWindows", () => {
  it("splits an inclusive range into windows", () => {
    expect(scanWindows(0n, 24n, 10n)).toEqual([
      [0n, 9n],
      [10n, 19n],
      [20n, 24n],
    ]);
    expect(scanWindows(5n, 4n, 10n)).toEqual([]);
  });
});

describe("withRetry", () => {
  it("retries with backoff, then rethrows the last error", async () => {
    let n = 0;
    expect(await withRetry(async () => (++n < 3 ? Promise.reject(new Error("x")) : "ok"), { delayMs: 0 })).toBe("ok");
    await expect(withRetry(async () => Promise.reject(new Error("down")), { attempts: 2, delayMs: 0 })).rejects.toThrow("down");
  });
});

describe("scanEvents", () => {
  it("decodes known card events, lowercases addresses and skips unknown or undecoded logs", async () => {
    const c = client({
      "0-9": [log("CardPublished", { owner: A.toUpperCase().replace("0X", "0x") }, D + 3n, 1, 1)],
      "10-14": [
        log("AgentPaused", { owner: A, triggeredBy: G }, D + 12n, 0, 2),
        log("Transfer", { owner: A }, D + 12n, 1, 4),
        { eventName: undefined, args: undefined, blockNumber: D + 13n, logIndex: 0, transactionHash: tx(3) },
      ],
    });
    const events = await scanEvents(c, D, D + 14n, { range: 10n, ...fast });
    expect(events).toEqual([
      { event: "CardPublished", owner: A, block: String(D + 3n), logIndex: 1, tx: tx(1) },
      { event: "AgentPaused", owner: A, triggeredBy: G, block: String(D + 12n), logIndex: 0, tx: tx(2) },
    ]);
    expect(c.calls).toEqual(["0-9", "10-14"]);
  });

  it("checks retention at the start of every window", async () => {
    const c = client({});
    await scanEvents(c, D, D + 24n, { range: 10n, ...fast });
    expect(c.canary.sort()).toEqual([D, D + 10n, D + 20n]);
  });

  it("fails when any window starts where the node has pruned logs", async () => {
    await expect(scanEvents(client({}, { prunedBelow: D + 15n }), D + 10n, D + 24n, { range: 10n, ...fast })).rejects.toThrow(/no logs at block/);
  });

  it("refuses a gap larger than MAX_SAFE_GAP and returns nothing for an empty range", async () => {
    await expect(scanEvents(client({}), D, D + MAX_SAFE_GAP, fast)).rejects.toThrow(/too close to public log history/);
    expect(await scanEvents(client({}), D + 5n, D + 4n, fast)).toEqual([]);
  });

  it("retries a failing window, then gives up after 3 failures", async () => {
    const ok = client({ "0-9": [log("CardPublished", { owner: A }, D + 1n, 0, 1)] }, { fail: { "0-9": 2 } });
    expect(await scanEvents(ok, D, D + 9n, { range: 10n, ...fast })).toHaveLength(1);
    await expect(scanEvents(client({}, { fail: { "0-9": 3 } }), D, D + 9n, { range: 10n, ...fast })).rejects.toThrow();
  });
});

describe("extendIndex", () => {
  it("stops CONFIRMATIONS blocks behind the chain head", async () => {
    const base = emptyIndex(D);
    const next = await extendIndex(base, client({}), D + 100n, { range: 10n, ...fast });
    expect(next.head).toBe(String(D + 100n - CONFIRMATIONS));
    expect(await extendIndex(next, client({}), D + 100n, fast)).toBe(next);
  });

  it("refuses an index whose head is ahead of the chain", async () => {
    await expect(extendIndex(emptyIndex(D + 500n), client({}), D + 100n, fast)).rejects.toThrow(/ahead of the chain head/);
  });
});

describe("mergeIndex and parseWallIndex", () => {
  const e1 = { event: "CardPublished", owner: A, block: String(D + 20n), logIndex: 2, tx: tx(1) };
  const e0 = { event: "CardPublished", owner: G, block: String(D + 20n), logIndex: 1, tx: tx(2) };

  it("deduplicates across case, orders by block and log index, and never moves the head back", () => {
    const base = mergeIndex(emptyIndex(D), [e1], D + 30n);
    const next = mergeIndex(base, [{ ...e1, owner: A.toUpperCase().replace("0X", "0x"), tx: tx(1).toUpperCase().replace("0X", "0x") }, e0], D + 25n);
    expect(next.head).toBe(String(D + 30n));
    expect(next.events).toEqual([e0, e1]);
    expect(interactedAddresses(next).sort()).toEqual([G, A].sort());
  });

  it("round-trips through JSON", () => {
    const idx = mergeIndex(emptyIndex(D), [e1, { ...e0, event: "AgentPaused", triggeredBy: A }], D + 30n);
    expect(parseWallIndex(JSON.parse(JSON.stringify(idx)))).toEqual(idx);
    expect(idx.contract).toBe(CARD_CONTRACT.toLowerCase());
  });

  it("rejects implausible indexes", () => {
    const idx = mergeIndex(emptyIndex(D), [e1], D + 30n);
    const bad = (patch: Record<string, unknown>, ev: Record<string, unknown> = {}) => parseWallIndex({ ...idx, ...patch, events: [{ ...e1, ...ev }] });
    expect(bad({ contract: G })).toBeNull();
    expect(bad({ chainId: 1 })).toBeNull();
    expect(bad({ head: 30 })).toBeNull();
    expect(bad({ head: "5" })).toBeNull();
    expect(bad({}, { owner: "nope" })).toBeNull();
    expect(bad({}, { event: "Transfer" })).toBeNull();
    expect(bad({}, { logIndex: -1 })).toBeNull();
    expect(bad({}, { logIndex: 1.5 })).toBeNull();
    expect(bad({}, { block: String(D + 31n) })).toBeNull();
    expect(bad({}, { block: "0" })).toBeNull();
    expect(bad({}, { tx: "0x12" })).toBeNull();
    expect(bad({}, { triggeredBy: 7 })).toBeNull();
  });
});
