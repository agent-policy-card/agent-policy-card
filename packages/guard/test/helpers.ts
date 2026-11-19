import { mkdirSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../src/config.js";

const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), ".tmp");

export function newTmpDir(): string {
  mkdirSync(TMP_ROOT, { recursive: true });
  return mkdtempSync(join(TMP_ROOT, "t-"));
}

export const PLACEHOLDER = "0x1111111111111111111111111111111111111111";

export function makeConfig(dir: string, rpcUrls: string[] = ["https://rpc1.example.test", "https://rpc2.example.test"]): Config {
  return { realBaw: "baw", wallet: PLACEHOLDER, rpcUrls, cardContract: PLACEHOLDER, dataDir: dir };
}
