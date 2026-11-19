import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { newTmpDir, PLACEHOLDER } from "./helpers.js";

const valid = { realBaw: "baw", wallet: PLACEHOLDER, rpcUrls: ["https://rpc.example.test"], cardContract: PLACEHOLDER };

function write(obj: unknown, raw?: string): string {
  const dir = newTmpDir();
  writeFileSync(join(dir, "config.json"), raw ?? JSON.stringify(obj));
  return dir;
}

describe("loadConfig", () => {
  it("loads a valid file with dataDir = dir", () => {
    const dir = write(valid);
    expect(loadConfig(dir)).toEqual({ ...valid, dataDir: dir });
  });
  it("throws when the file is missing", () => {
    expect(() => loadConfig(newTmpDir())).toThrow();
  });
  it("throws on bad JSON", () => {
    expect(() => loadConfig(write(null, "{nope"))).toThrow();
  });
  it("throws on a bad wallet", () => {
    expect(() => loadConfig(write({ ...valid, wallet: "0x12" }))).toThrow();
  });
  it("throws on empty rpcUrls", () => {
    expect(() => loadConfig(write({ ...valid, rpcUrls: [] }))).toThrow();
  });
  it("throws on an ftp url", () => {
    expect(() => loadConfig(write({ ...valid, rpcUrls: ["ftp://rpc.example.test"] }))).toThrow();
  });
});
