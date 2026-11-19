import { CARD_ABI } from "@apc/policy-core";
import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { buildPauseCalldata, guardianState } from "./guardian";

const AGENT = "0x1111111111111111111111111111111111111111";
const GUARD = "0x2222222222222222222222222222222222222222";
const card = (over: Partial<{ version: number; paused: boolean; guardian: string | null }> = {}) => ({
  version: 1,
  paused: false,
  guardian: GUARD as string | null,
  ...over,
});

describe("guardianState", () => {
  it("invalid agent", () => {
    expect(guardianState("0x12", card(), GUARD)).toEqual({ kind: "invalid-agent" });
  });
  it("no card when null or version 0", () => {
    expect(guardianState(AGENT, null, GUARD)).toEqual({ kind: "no-card" });
    expect(guardianState(AGENT, card({ version: 0 }), GUARD)).toEqual({ kind: "no-card" });
  });
  it("no guardian", () => {
    expect(guardianState(AGENT, card({ guardian: null }), GUARD)).toEqual({ kind: "no-guardian" });
  });
  it("not guardian when disconnected or different", () => {
    expect(guardianState(AGENT, card(), null)).toEqual({ kind: "not-guardian", guardian: GUARD });
    expect(guardianState(AGENT, card(), AGENT)).toEqual({ kind: "not-guardian", guardian: GUARD });
  });
  it("already paused", () => {
    expect(guardianState(AGENT, card({ paused: true }), GUARD)).toEqual({ kind: "already-paused" });
  });
  it("can pause, case-insensitive match", () => {
    expect(guardianState(AGENT, card(), GUARD)).toEqual({ kind: "can-pause" });
    expect(guardianState(AGENT, card({ guardian: "0xAbCdEf" + "0".repeat(33) + "1" }), "0xabcdef" + "0".repeat(33) + "1")).toEqual({ kind: "can-pause" });
  });
});

describe("buildPauseCalldata", () => {
  it("decodes back to pause(agent)", () => {
    const d = decodeFunctionData({ abi: CARD_ABI, data: buildPauseCalldata(AGENT) });
    expect(d.functionName).toBe("pause");
    expect((d.args?.[0] as string).toLowerCase()).toBe(AGENT);
  });
  it("throws on invalid address", () => {
    expect(() => buildPauseCalldata("0x12")).toThrow();
  });
});
