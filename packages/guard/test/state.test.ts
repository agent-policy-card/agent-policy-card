import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getEntry, putEntry, setVerdict, type StateEntry } from "../src/state.js";
import { makeConfig, newTmpDir } from "./helpers.js";

const NOW = 1_800_000_000_000;
const entry = (id: string, over: Partial<StateEntry> = {}): StateEntry => ({
  requestId: id,
  verdict: "PENDING_HUMAN_CONFIRM",
  reasonCode: "CARD_CHANGE_NEEDS_HUMAN",
  cardCall: true,
  expiresAt: NOW + 60_000,
  intentHash: "0xabc",
  ...over,
});

describe("state", () => {
  it("round trips", () => {
    const cfg = makeConfig(newTmpDir());
    putEntry(cfg, entry("r1"), NOW);
    expect(getEntry(cfg, "r1")).toEqual(entry("r1"));
    expect(getEntry(cfg, "nope")).toBeNull();
  });

  it("returns null when a byte of state.json is flipped", () => {
    const cfg = makeConfig(newTmpDir());
    putEntry(cfg, entry("r1"), NOW);
    const p = join(cfg.dataDir, "state.json");
    const text = readFileSync(p, "utf8");
    const i = text.indexOf("intentHash") + 15;
    writeFileSync(p, text.slice(0, i) + (text[i] === "a" ? "b" : "a") + text.slice(i + 1));
    expect(getEntry(cfg, "r1")).toBeNull();
  });

  it("setVerdict updates the verdict and the mac verifies", () => {
    const cfg = makeConfig(newTmpDir());
    putEntry(cfg, entry("r1"), NOW);
    setVerdict(cfg, "r1", "ALLOW_FOR_PREVIEW");
    expect(getEntry(cfg, "r1")?.verdict).toBe("ALLOW_FOR_PREVIEW");
    const file = JSON.parse(readFileSync(join(cfg.dataDir, "state.json"), "utf8"));
    const key = readFileSync(join(cfg.dataDir, "state.key"), "utf8").trim();
    const mac = createHmac("sha256", key).update(JSON.stringify(file.entries)).digest("hex");
    expect(file.mac).toBe(mac);
  });

  it("setVerdict throws on an unknown id", () => {
    const cfg = makeConfig(newTmpDir());
    expect(() => setVerdict(cfg, "ghost", "BLOCK")).toThrow("unknown requestId");
    putEntry(cfg, entry("r1"), NOW);
    expect(() => setVerdict(cfg, "ghost", "BLOCK")).toThrow("unknown requestId");
  });

  it("prunes entries expired more than 24h on the next put", () => {
    const cfg = makeConfig(newTmpDir());
    putEntry(cfg, entry("old", { expiresAt: NOW }), NOW);
    expect(getEntry(cfg, "old")).not.toBeNull();
    putEntry(cfg, entry("new"), NOW + 24 * 3600_000 + 1);
    expect(getEntry(cfg, "old")).toBeNull();
    expect(getEntry(cfg, "new")).not.toBeNull();
  });

  it("uses mode 0o600 for state.key and state.json", () => {
    const cfg = makeConfig(newTmpDir());
    putEntry(cfg, entry("r1"), NOW);
    expect(statSync(join(cfg.dataDir, "state.key")).mode & 0o777).toBe(0o600);
    expect(statSync(join(cfg.dataDir, "state.json")).mode & 0o777).toBe(0o600);
  });
});
