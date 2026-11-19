import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { newTmpDir } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const bin = join(pkg, "dist", "apc-baw.mjs");

function home(withConfig: boolean): string {
  const h = newTmpDir();
  if (withConfig) {
    const dir = join(h, ".agent-policy-card");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        realBaw: join(here, "fake-baw.mjs"),
        wallet: "0x1111111111111111111111111111111111111111",
        // Unroutable address: chain reads fail fast and the guard must fail closed.
        rpcUrls: ["http://127.0.0.1:9"],
        cardContract: "0x2222222222222222222222222222222222222222",
      }),
    );
  }
  return h;
}

function run(h: string, args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { env: { PATH: process.env.PATH ?? "", HOME: h }, encoding: "utf8" });
}

describe("apc-baw binary", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "-s", "build"], { cwd: pkg });
  }, 60_000);

  it("passes reads through to the real CLI", () => {
    const r = run(home(true), ["wallet", "balance", "--json"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"balance":"1"');
  });

  it("fails closed on a preview when the chain cannot be read, and leaks no requestId", () => {
    const r = run(home(true), ["contract-call", "preview", "--binanceChainId", "56", "--from", "0x1111111111111111111111111111111111111111", "--to", "0x3333333333333333333333333333333333333333", "--value", "0", "--inputData", "0x", "--json"]);
    expect(r.status).toBe(3);
    expect(r.stdout).not.toContain("fake-secret-request");
    expect(JSON.parse(r.stdout).reasonCode).toBe("CHAIN_READ_FAILED");
  });

  it("blocks writes without a config", () => {
    const r = run(home(false), ["wallet", "send", "--amount", "1"]);
    expect(r.status).toBe(3);
  });

  it("refuses an execute for a requestId it never approved", () => {
    const r = run(home(true), ["contract-call", "execute", "--requestId", "fake-secret-request", "--json"]);
    expect(r.status).toBe(3);
  });
});
