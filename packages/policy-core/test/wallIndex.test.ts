import { describe, expect, it } from "vitest";
import {
  CARD_CONTRACT,
  RETENTION_CANARY,
  emptyIndex,
  interactedAddresses,
  mergeIndex,
  parseWallIndex,
  scanEvents,
  scanWindows,
  type LogLike,
  type ScanClient,
} from "../src/index.js";

const A = "0x3333333333333333333333333333333333333333";
const G = "0x1111111111111111111111111111111111111111";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const log = (eventName: string, args: Record<string, unknown>, block: bigint, logIndex: number, t: number): LogLike => ({ eventName, args, blockNumber: block, logIndex, transactionHash: tx(t) });

function client(cardLogs: Record<string, LogLike[]>, opts: { pruned?: boolean; fail?: Record<string, number> } = {}): ScanClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getLogs: async ({ address, fromBlock, toBlock }) => {
      const key = `${fromBlock}-${toBlock}`;
      if (address === RETENTION_CANARY) return opts.pruned ? [] : [log("Transfer", {}, fromBlock, 0, 999)];
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

describe("scanEvents", () => {
  it("decodes owners and pause triggers from each window", async () => {
    const c = client({
      "0-9": [log("CardPublished", { owner: A.toUpperCase().replace("0X", "0x") }, 3n, 1, 1)],
      "10-14": [log("AgentPaused", { owner: A, triggeredBy: G }, 12n, 0, 2), { eventName: undefined, args: undefined, blockNumber: 13n, logIndex: 0, transactionHash: tx(3) }],
    });
    const events = await scanEvents(c, 0n, 14n, { range: 10n });
    expect(events).toEqual([
      { event: "CardPublished", owner: A, block: "3", logIndex: 1, tx: tx(1) },
      { event: "AgentPaused", owner: A, triggeredBy: G, block: "12", logIndex: 0, tx: tx(2) },
    ]);
    expect(c.calls).toEqual(["0-9", "10-14"]);
  });

  it("refuses to scan when the node has pruned logs at the start block", async () => {
    await expect(scanEvents(client({}, { pruned: true }), 0n, 9n, { range: 10n })).rejects.toThrow(/no logs at block 0/);
  });

  it("retries a failing window, then gives up after 3 failures", async () => {
    const ok = client({ "0-9": [log("CardPublished", { owner: A }, 1n, 0, 1)] }, { fail: { "0-9": 2 } });
    expect(await scanEvents(ok, 0n, 9n, { range: 10n })).toHaveLength(1);
    await expect(scanEvents(client({}, { fail: { "0-9": 3 } }), 0n, 9n, { range: 10n })).rejects.toThrow();
  });
});

describe("mergeIndex and parseWallIndex", () => {
  const e1 = { event: "CardPublished", owner: A, block: "20", logIndex: 2, tx: tx(1) };
  const e0 = { event: "CardPublished", owner: G, block: "20", logIndex: 1, tx: tx(2) };

  it("deduplicates, orders by block and log index, and never moves the head back", () => {
    const base = mergeIndex(emptyIndex(10n), [e1], 30n);
    const next = mergeIndex(base, [e1, e0], 25n);
    expect(next.head).toBe("30");
    expect(next.events).toEqual([e0, e1]);
    expect(interactedAddresses(next).sort()).toEqual([G, A].sort());
  });

  it("round-trips through JSON and rejects an index for another contract", () => {
    const idx = mergeIndex(emptyIndex(10n), [e1, { ...e0, event: "AgentPaused", triggeredBy: A }], 30n);
    expect(parseWallIndex(JSON.parse(JSON.stringify(idx)))).toEqual(idx);
    expect(parseWallIndex({ ...idx, contract: G })).toBeNull();
    expect(parseWallIndex({ ...idx, head: 30 })).toBeNull();
    expect(parseWallIndex({ ...idx, events: [{ ...e1, owner: "nope" }] })).toBeNull();
    expect(idx.contract).toBe(CARD_CONTRACT.toLowerCase());
  });
});
