import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Config = { realBaw: string; wallet: string; rpcUrls: string[]; cardContract: string; dataDir: string };

export function defaultConfigDir(): string {
  return join(homedir(), ".agent-policy-card");
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function loadConfig(dir: string = defaultConfigDir()): Config {
  const raw = readFileSync(join(dir, "config.json"), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("config.json is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("config.json must be an object");
  }
  const c = parsed as Record<string, unknown>;
  if (typeof c.realBaw !== "string" || c.realBaw.length === 0) throw new Error("config: realBaw must be a non-empty string");
  if (typeof c.wallet !== "string" || !ADDRESS.test(c.wallet)) throw new Error("config: wallet must be a 0x address");
  if (typeof c.cardContract !== "string" || !ADDRESS.test(c.cardContract)) {
    throw new Error("config: cardContract must be a 0x address");
  }
  const urls = c.rpcUrls;
  if (
    !Array.isArray(urls) ||
    urls.length === 0 ||
    !urls.every((u) => typeof u === "string" && (u.startsWith("https://") || u.startsWith("http://")))
  ) {
    throw new Error("config: rpcUrls must be a non-empty array of http(s) urls");
  }
  return { realBaw: c.realBaw, wallet: c.wallet, rpcUrls: urls as string[], cardContract: c.cardContract, dataDir: dir };
}
