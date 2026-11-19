import { canonicalize, describePolicy, PRESETS } from "@apc/policy-core";
import { describe, expect, it, vi } from "vitest";
import { readCard } from "./readCard";

const OWNER = "0x1111111111111111111111111111111111111111";
const CARD = "0x2222222222222222222222222222222222222222";
const ZERO = "0x0000000000000000000000000000000000000000";
const GUARDIAN = "0x3333333333333333333333333333333333333333";
const ROOT = `0x${"ab".repeat(32)}`;

type Card = { policyText: string; guardian: string; version: number; paused: boolean; updatedAt: bigint };
type Att = {
  epoch: number;
  allowedCount: number;
  blockedEip712: number;
  blockedApprove: number;
  blockedSelector: number;
  blockedOther: number;
  logMerkleRoot: string;
  periodStart: bigint;
  periodEnd: bigint;
  submittedAt: bigint;
};

const shieldText = canonicalize(PRESETS["eip712-shield"]);

function card(over: Partial<Card> = {}): Card {
  return { policyText: shieldText, guardian: GUARDIAN, version: 1, paused: false, updatedAt: 1700000000n, ...over };
}

function att(over: Partial<Att> = {}): Att {
  return {
    epoch: 0,
    allowedCount: 0,
    blockedEip712: 0,
    blockedApprove: 0,
    blockedSelector: 0,
    blockedOther: 0,
    logMerkleRoot: ROOT,
    periodStart: 0n,
    periodEnd: 0n,
    submittedAt: 0n,
    ...over,
  };
}

function fake(c: Card, a: Att) {
  const readContract = vi.fn(async (req: { functionName: string }) => {
    if (req.functionName === "getCard") return c;
    if (req.functionName === "getLatestAttestation") return a;
    throw new Error("unexpected " + req.functionName);
  });
  return { readContract } as unknown as { readContract: typeof readContract } & Parameters<typeof readCard>[1];
}

describe("readCard", () => {
  it("rejects an invalid address without calling the client", async () => {
    const client = fake(card(), att());
    const r = await readCard("nope", client, CARD);
    expect(r).toEqual({ error: "Not a 0x address" });
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("version 0 gives status NONE", async () => {
    const r = await readCard(OWNER, fake(card({ version: 0, policyText: "", guardian: ZERO }), att()), CARD);
    expect(r).toMatchObject({ status: "NONE", version: 0, rules: [], guardian: null, attestation: null });
  });

  it("an active card gives ACTIVE and the preset rules", async () => {
    const r = await readCard(OWNER, fake(card(), att()), CARD);
    expect(r).toMatchObject({
      status: "ACTIVE",
      version: 1,
      rules: describePolicy(PRESETS["eip712-shield"]),
      guardian: GUARDIAN,
      updatedAt: 1700000000,
      policyText: shieldText,
    });
  });

  it("paused gives PAUSED", async () => {
    const r = await readCard(OWNER, fake(card({ paused: true }), att()), CARD);
    expect(r).toMatchObject({ status: "PAUSED" });
  });

  it("zero guardian gives null", async () => {
    const r = await readCard(OWNER, fake(card({ guardian: ZERO }), att()), CARD);
    expect(r).toMatchObject({ guardian: null });
  });

  it("unreadable policyText gives the single unreadable rule", async () => {
    const r = await readCard(OWNER, fake(card({ policyText: "{not json" }), att()), CARD);
    expect(r).toMatchObject({ status: "ACTIVE", rules: ["Policy text is unreadable"] });
  });

  it("attestation epoch 0 gives null", async () => {
    const r = await readCard(OWNER, fake(card(), att()), CARD);
    expect(r).toMatchObject({ attestation: null });
  });

  it("attestation epoch 2 sums the blocked fields", async () => {
    const a = att({
      epoch: 2,
      allowedCount: 7,
      blockedEip712: 1,
      blockedApprove: 2,
      blockedSelector: 3,
      blockedOther: 4,
      periodStart: 100n,
      periodEnd: 200n,
      submittedAt: 300n,
    });
    const r = await readCard(OWNER, fake(card(), a), CARD);
    expect(r).toMatchObject({
      attestation: {
        epoch: 2,
        allowedCount: 7,
        totalBlocked: 10,
        logMerkleRoot: ROOT,
        periodStart: 100,
        periodEnd: 200,
        submittedAt: 300,
      },
    });
  });

  it("a throwing client gives the chain error", async () => {
    const client = { readContract: vi.fn(async () => { throw new Error("rpc down"); }) } as unknown as Parameters<typeof readCard>[1];
    const r = await readCard(OWNER, client, CARD);
    expect(r).toEqual({ error: "Could not read the card from the chain" });
  });
});
