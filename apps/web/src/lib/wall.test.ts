import { describe, expect, it } from "vitest";
import { buildWall, type PublishLog, type CardSnapshot } from "./wall";

const A = "0x2222222222222222222222222222222222222222";
const B = "0x3333333333333333333333333333333333333333";
const C = "0x4444444444444444444444444444444444444444";

const logs: PublishLog[] = [
  { owner: B, block: 120n, logIndex: 3, version: 1 },
  { owner: A, block: 100n, logIndex: 1, version: 1 },
  { owner: A, block: 150n, logIndex: 0, version: 2 },
  { owner: C.toUpperCase().replace("0X", "0x"), block: 120n, logIndex: 1, version: 1 },
];

const snap = (paused: boolean, blocked: number | null, updatedAt: number): CardSnapshot => ({ paused, version: 1, totalBlocked: blocked, allowed: blocked === null ? null : 1, updatedAt, ruleCount: 6 });

describe("buildWall", () => {
  it("numbers founding cards by first publish order, one entry per owner", () => {
    const wall = buildWall(logs, { [A]: snap(false, 6, 300), [B]: snap(true, null, 200), [C]: snap(false, 0, 250) });
    expect(wall.entries.map((e) => [e.owner, e.founding])).toEqual([
      [A, 1],
      [C, 2],
      [B, 3],
    ]);
  });

  it("counts cards, paused cards and blocked actions", () => {
    const wall = buildWall(logs, { [A]: snap(false, 6, 300), [B]: snap(true, null, 200), [C]: snap(false, 0, 250) });
    expect(wall.totals).toEqual({ cards: 3, paused: 1, blocked: 6, attested: 2 });
  });

  it("only the first 50 cards carry a founding number", () => {
    const many: PublishLog[] = Array.from({ length: 52 }, (_, i) => ({ owner: `0x${(i + 1).toString(16).padStart(40, "0")}`, block: BigInt(i), logIndex: 0, version: 1 }));
    const wall = buildWall(many, {});
    expect(wall.entries.filter((e) => e.founding !== null)).toHaveLength(50);
    expect(wall.entries.find((e) => e.owner.endsWith("34"))?.founding).toBeNull();
  });

  it("skips owners whose snapshot is missing from the totals but keeps them listed", () => {
    const wall = buildWall(logs, { [A]: snap(false, 2, 300) });
    expect(wall.entries).toHaveLength(3);
    expect(wall.totals.blocked).toBe(2);
  });
});

describe("publishLogs", () => {
  it("keeps only publish events from the index, in index order", async () => {
    const { emptyIndex, mergeIndex } = await import("@apc/policy-core");
    const { publishLogs } = await import("./wall");
    const t = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
    const idx = mergeIndex(
      emptyIndex(0n),
      [
        { event: "AttestationSubmitted", owner: A, block: "9", logIndex: 0, tx: t(3) },
        { event: "CardPublished", owner: B, block: "5", logIndex: 1, tx: t(2) },
        { event: "CardPublished", owner: A, block: "5", logIndex: 0, tx: t(1) },
      ],
      10n,
    );
    expect(publishLogs(idx).map((l) => [l.owner, l.block])).toEqual([
      [A, 5n],
      [B, 5n],
    ]);
  });
});

describe("fetchWall", () => {
  const setup = async () => {
    const core = await import("@apc/policy-core");
    const { fetchWall } = await import("./wall");
    const D = core.DEPLOY_BLOCK;
    const t = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
    const idx = core.mergeIndex(
      core.emptyIndex(D),
      [
        { event: "CardPublished", owner: A, block: String(D + 1n), logIndex: 0, tx: t(1) },
        { event: "CardPublished", owner: C, block: String(D + 2n), logIndex: 0, tx: t(2) },
      ],
      D + 10n,
    );
    const policyText = core.canonicalize(core.PRESETS["eip712-shield"]);
    const fakeClient = (o: { head: bigint; tail?: unknown[]; failLogs?: boolean; unpublished?: string[] }) =>
      ({
        getBlockNumber: async () => o.head,
        getLogs: async ({ address }: { address: string }) => {
          if (o.failLogs) throw new Error("rpc");
          return address === core.RETENTION_CANARY ? [{}] : (o.tail ?? []);
        },
        readContract: async ({ functionName, args }: { functionName: string; args: [string] }) =>
          functionName === "getCard"
            ? { policyText, paused: false, version: (o.unpublished ?? []).includes(args[0]) ? 0 : 1, updatedAt: 1n }
            : { epoch: 0, allowedCount: 0, blockedEip712: 0, blockedApprove: 0, blockedSelector: 0, blockedOther: 0 },
      }) as never;
    const fetcher = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });
    return { core, fetchWall, D, t, idx, fakeClient, fetcher };
  };

  it("adds cards from the live tail and reports a fresh shelf", async () => {
    const { fetchWall, D, t, idx, fakeClient, fetcher } = await setup();
    const tail = [{ eventName: "CardPublished", args: { owner: B }, blockNumber: D + 20n, logIndex: 0, transactionHash: t(3) }];
    const c = fakeClient({ head: D + 200n, tail });
    const wall = await fetchWall(c, c, { fetcher: fetcher(idx), retryDelayMs: 0 });
    expect(wall.entries.map((e) => e.owner)).toEqual([A, C, B]);
    expect(wall.fresh).toBe(true);
  });

  it("falls back to the index alone, marked not fresh, when the tail fails or is too long", async () => {
    const { core, fetchWall, D, idx, fakeClient, fetcher } = await setup();
    for (const c of [fakeClient({ head: D + 200n, failLogs: true }), fakeClient({ head: D + 10n + core.MAX_SAFE_GAP + 500n })]) {
      const wall = await fetchWall(c, c, { fetcher: fetcher(idx), retryDelayMs: 0 });
      expect(wall.entries.map((e) => e.owner)).toEqual([A, C]);
      expect(wall.fresh).toBe(false);
    }
  });

  it("drops an owner whose card reads back unpublished", async () => {
    const { fetchWall, D, idx, fakeClient, fetcher } = await setup();
    const c = fakeClient({ head: D + 100n, unpublished: [C] });
    const wall = await fetchWall(c, c, { fetcher: fetcher(idx), retryDelayMs: 0 });
    expect(wall.entries.map((e) => e.owner)).toEqual([A]);
  });

  it("throws when the index is missing or invalid", async () => {
    const { fetchWall, D, idx, fakeClient, fetcher } = await setup();
    const c = fakeClient({ head: D + 100n });
    await expect(fetchWall(c, c, { fetcher: fetcher(idx, false) })).rejects.toThrow(/unavailable/);
    await expect(fetchWall(c, c, { fetcher: fetcher({ ...idx, contract: A }) })).rejects.toThrow(/unavailable/);
  });
});
