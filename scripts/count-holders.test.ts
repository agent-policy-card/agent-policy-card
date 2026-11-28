import { describe, expect, it } from "vitest";
import { emptyIndex, mergeIndex } from "@apc/policy-core";
import { countHolders, type BalanceClient } from "./count-holders.js";
import { buildSeed, pickBase, type ReceiptClient } from "./index-wall.js";

const A = "0x3333333333333333333333333333333333333333";
const B = "0x4444444444444444444444444444444444444444";
const G = "0x1111111111111111111111111111111111111111";
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

function balances(holders: string[], failures = 0): BalanceClient {
  let left = failures;
  return {
    readContract: async ({ args }) => {
      if (left-- > 0) throw new Error("rpc");
      return holders.includes(String(args[0]).toLowerCase()) ? 1n : 0n;
    },
  };
}

const index = mergeIndex(
  emptyIndex(0n),
  [
    { event: "CardPublished", owner: A, block: "1", logIndex: 0, tx: tx(1) },
    { event: "AgentPaused", owner: A, triggeredBy: G, block: "2", logIndex: 0, tx: tx(2) },
    { event: "AttestationSubmitted", owner: A, block: "3", logIndex: 0, tx: tx(3) },
    { event: "CardPublished", owner: B, block: "4", logIndex: 0, tx: tx(4) },
  ],
  10n,
);

describe("countHolders", () => {
  it("counts owners and pause triggers once each and filters Agent ID holders", async () => {
    expect(await countHolders(index, balances([A]))).toEqual({ total: 3, holders: 1 });
  });

  it("retries a failing balance read, then gives up after 3 failures", async () => {
    expect(await countHolders(index, balances([A], 2))).toEqual({ total: 3, holders: 1 });
    await expect(countHolders(index, balances([A], 3))).rejects.toThrow();
  });
});

describe("index-wall helpers", () => {
  it("pickBase takes the newest index and refuses when there is none", () => {
    const older = emptyIndex(5n);
    expect(pickBase(older, index, null)).toBe(index);
    expect(() => pickBase(null, null)).toThrow(/bootstrap/);
  });

  it("buildSeed keeps only card contract logs and rejects receipts after the head", async () => {
    const receipt = (block: bigint): ReceiptClient => ({
      getTransactionReceipt: async () => ({ blockNumber: block, logs: [{ address: "0x2222222222222222222222222222222222222222" }] }),
    });
    expect((await buildSeed(receipt(5n), 10n, [tx(1)])).events).toEqual([]);
    await expect(buildSeed(receipt(11n), 10n, [tx(1)])).rejects.toThrow(/after the seed head/);
    await expect(buildSeed(receipt(5n), 10n, ["nope"])).rejects.toThrow(/valid transaction hash/);
  });
});
