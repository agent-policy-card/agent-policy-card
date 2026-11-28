import { describe, expect, it } from "vitest";
import { CARD_ABI, CARD_CONTRACT, DEPLOY_BLOCK, emptyIndex, mergeIndex } from "@apc/policy-core";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countHolders, type BalanceClient } from "./count-holders.js";
import { buildSeed, loadIndex, pickBase, seedRequest, type ReceiptClient } from "./index-wall.js";

const A = "0x3333333333333333333333333333333333333333";
const B = "0x4444444444444444444444444444444444444444";
const G = "0x1111111111111111111111111111111111111111";
const D = DEPLOY_BLOCK;
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
  emptyIndex(D),
  [
    { event: "CardPublished", owner: A, block: String(D + 1n), logIndex: 0, tx: tx(1) },
    { event: "AgentPaused", owner: A, triggeredBy: G, block: String(D + 2n), logIndex: 0, tx: tx(2) },
    { event: "AttestationSubmitted", owner: A.toUpperCase().replace("0X", "0x"), block: String(D + 3n), logIndex: 0, tx: tx(3) },
    { event: "CardPublished", owner: B, block: String(D + 4n), logIndex: 0, tx: tx(4) },
  ],
  D + 10n,
);

describe("countHolders", () => {
  it("counts owners and pause triggers once each, across case, and filters Agent ID holders", async () => {
    expect(await countHolders(index, balances([A]), undefined, 0)).toEqual({ total: 3, holders: 1 });
  });

  it("retries a failing balance read, then gives up after 3 failures", async () => {
    expect(await countHolders(index, balances([A], 2), undefined, 0)).toEqual({ total: 3, holders: 1 });
    await expect(countHolders(index, balances([A], 3), undefined, 0)).rejects.toThrow();
  });
});

describe("index-wall helpers", () => {
  it("pickBase takes the newest index and refuses when there is none", () => {
    expect(pickBase(emptyIndex(D), index, null)).toBe(index);
    expect(() => pickBase(null, null)).toThrow(/bootstrap/);
  });

  it("seedRequest needs a head whenever transactions are given", () => {
    expect(seedRequest({})).toBeNull();
    expect(seedRequest({ SEED_HEAD: "12", SEED_TXS: `${tx(1)} ${tx(2)}` })).toEqual({ head: 12n, hashes: [tx(1), tx(2)] });
    expect(seedRequest({ SEED_HEAD: "12" })).toEqual({ head: 12n, hashes: [] });
    expect(() => seedRequest({ SEED_TXS: tx(1) })).toThrow(/SEED_HEAD/);
    expect(() => seedRequest({ SEED_HEAD: "--previous" })).toThrow(/SEED_HEAD/);
  });

  it("buildSeed decodes the card contract's logs and ignores other contracts", async () => {
    const event = CARD_ABI.find((x) => x.type === "event" && x.name === "CardPublished")!;
    const topics = encodeEventTopics({ abi: [event], eventName: "CardPublished", args: { owner: A, version: 1 } });
    const data = encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [tx(9) as `0x${string}`, G]);
    const receipt: ReceiptClient = {
      getTransactionReceipt: async () => ({
        blockNumber: D + 5n,
        logs: [
          { address: CARD_CONTRACT, topics, data, blockNumber: D + 5n, logIndex: 7, transactionHash: tx(1) } as never,
          { address: G, topics, data, blockNumber: D + 5n, logIndex: 8, transactionHash: tx(1) } as never,
        ],
      }),
    };
    const seed = await buildSeed(receipt, D + 10n, [tx(1)]);
    expect(seed.head).toBe(String(D + 10n));
    expect(seed.events).toEqual([{ event: "CardPublished", owner: A, block: String(D + 5n), logIndex: 7, tx: tx(1) }]);
    expect((await buildSeed(receipt, D + 10n, [])).events).toEqual([]);
    await expect(buildSeed(receipt, D + 4n, [tx(1)])).rejects.toThrow(/after the seed head/);
    await expect(buildSeed(receipt, D + 10n, ["nope"])).rejects.toThrow(/32-byte hashes/);
  });

  it("loadIndex reads files and URLs and returns null for anything invalid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wall-"));
    const file = join(dir, "i.json");
    writeFileSync(file, JSON.stringify(index));
    expect(await loadIndex(file)).toEqual(index);
    expect(await loadIndex(join(dir, "missing.json"))).toBeNull();
    writeFileSync(file, "{not json");
    expect(await loadIndex(file)).toBeNull();
    expect(await loadIndex("https://x.test/i.json", async () => ({ ok: true, json: async () => index }))).toEqual(index);
    expect(await loadIndex("https://x.test/i.json", async () => ({ ok: false, json: async () => index }))).toBeNull();
    expect(await loadIndex("https://x.test/i.json", async () => Promise.reject(new Error("offline")))).toBeNull();
  });
});
