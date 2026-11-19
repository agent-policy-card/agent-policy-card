import { describe, expect, it } from "vitest";
import { confirm, type ConfirmIO } from "../src/confirm.js";
import { getEntry, putEntry } from "../src/state.js";
import type { Config } from "../src/config.js";
import { newTmpDir } from "./helpers.js";

const NOW = 1_800_000_000_000;

function setup(verdict: "PENDING_HUMAN_CONFIRM" | "ALLOW_FOR_PREVIEW" = "PENDING_HUMAN_CONFIRM", expiresAt = NOW + 60_000): Config {
  const c: Config = {
    realBaw: "baw",
    wallet: "0x1111111111111111111111111111111111111111",
    rpcUrls: ["https://rpc.example.test"],
    cardContract: "0x2222222222222222222222222222222222222222",
    dataDir: newTmpDir(),
  };
  putEntry(c, { requestId: "r1", verdict, reasonCode: "CARD_CHANGE_NEEDS_HUMAN", cardCall: true, expiresAt, intentHash: "h", summary: "unpause the agent card" }, NOW);
  return c;
}

function io(isTTY: boolean, answer: string, out: string[]): ConfirmIO {
  return { isTTY, prompt: async () => answer, print: (s) => out.push(s), randomCode: () => "K7Q2XZ", now: () => NOW };
}

describe("confirm", () => {
  it("refuses without a real terminal and leaves state unchanged", async () => {
    const c = setup();
    const out: string[] = [];
    expect(await confirm("r1", io(false, "K7Q2XZ", out), c)).toBe(2);
    expect(getEntry(c, "r1")?.verdict).toBe("PENDING_HUMAN_CONFIRM");
  });

  it("rejects a wrong code", async () => {
    const c = setup();
    expect(await confirm("r1", io(true, "nope", []), c)).toBe(1);
    expect(getEntry(c, "r1")?.verdict).toBe("PENDING_HUMAN_CONFIRM");
  });

  it("approves on the right code and shows the summary", async () => {
    const c = setup();
    const out: string[] = [];
    expect(await confirm("r1", io(true, " K7Q2XZ \n", out), c)).toBe(0);
    expect(getEntry(c, "r1")?.verdict).toBe("ALLOW_FOR_PREVIEW");
    expect(out.join("\n")).toContain("unpause the agent card");
  });

  it("refuses entries that are not pending, unknown ids and expired requests", async () => {
    expect(await confirm("r1", io(true, "K7Q2XZ", []), setup("ALLOW_FOR_PREVIEW"))).toBe(1);
    expect(await confirm("zz", io(true, "K7Q2XZ", []), setup())).toBe(1);
    const expired = setup("PENDING_HUMAN_CONFIRM", NOW - 1);
    expect(await confirm("r1", io(true, "K7Q2XZ", []), expired)).toBe(1);
    expect(getEntry(expired, "r1")?.verdict).toBe("PENDING_HUMAN_CONFIRM");
  });
});
