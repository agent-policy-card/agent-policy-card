import { describe, expect, it } from "vitest";
import { countHolders, type HolderClient } from "./count-holders.js";

const A = "0x3333333333333333333333333333333333333333";
const B = "0x4444444444444444444444444444444444444444";
const G = "0x1111111111111111111111111111111111111111";

function client(logsByChunk: Record<string, unknown[]>, holders: string[], failures: Record<string, number> = {}): HolderClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getLogs: async ({ fromBlock, toBlock }) => {
      const key = `${fromBlock}-${toBlock}`;
      calls.push(key);
      if ((failures[key] ?? 0) > 0) {
        failures[key]!--;
        throw new Error("rpc");
      }
      return (logsByChunk[key] ?? []) as never;
    },
    readContract: async ({ args }) => (holders.includes(String(args[0]).toLowerCase()) ? 1n : 0n) as never,
  };
}

const opts = { cardContract: "0x2222222222222222222222222222222222222222", agentId: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f", fromBlock: 0n, toBlock: 9n, chunk: 5n };

describe("countHolders", () => {
  it("collects owners and triggeredBy once each and filters Agent ID holders", async () => {
    const c = client(
      {
        "0-4": [
          { eventName: "CardPublished", args: { owner: A } },
          { eventName: "AgentPaused", args: { owner: A, triggeredBy: G } },
        ],
        "5-9": [
          { eventName: "AttestationSubmitted", args: { owner: A.toLowerCase() } },
          { eventName: "CardPublished", args: { owner: B } },
        ],
      },
      [A.toLowerCase()],
    );
    expect(await countHolders(c, opts)).toEqual({ total: 3, holders: 1 });
    expect(c.calls).toEqual(["0-4", "5-9"]);
  });

  it("retries a failing chunk up to 3 times", async () => {
    const c = client({ "0-4": [{ eventName: "CardPublished", args: { owner: A } }] }, [A.toLowerCase()], { "0-4": 2 });
    expect(await countHolders(c, opts)).toEqual({ total: 1, holders: 1 });
  });

  it("throws after 3 failures", async () => {
    const c = client({}, [], { "5-9": 3 });
    await expect(countHolders(c, opts)).rejects.toThrow();
  });
});
