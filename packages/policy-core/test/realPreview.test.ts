// Uses a real contract-call preview captured on 2026-11-19 (wallet address and requestId replaced).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluate, toIntent } from "../src/evaluate.js";
import { CARD, WALLET, chainWith, contractArgs } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const real = JSON.parse(readFileSync(join(here, "fixtures", "preview-contract-call.real.json"), "utf8"));
const AGENT_ID = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const balanceOf = "0x70a08231000000000000000000000000" + WALLET.slice(2);

describe("real wallet preview", () => {
  it("a value-0 read-like call to the Agent ID contract passes the default card", () => {
    const d = evaluate(toIntent("contract-call preview", contractArgs(AGENT_ID, balanceOf), real), chainWith(), CARD);
    expect(d).toEqual({ verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", bucket: "allowed", cardCall: false });
  });

  it("the same preview with value above the card limit is blocked", () => {
    const d = evaluate(toIntent("contract-call preview", contractArgs(AGENT_ID, balanceOf, "20000000000000000"), real), chainWith(), CARD);
    expect(d.reasonCode).toBe("BLOCKED_OTHER");
  });
});
