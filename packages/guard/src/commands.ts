// Classifies wallet CLI argv. Anything not recognised is "unknown" and gets blocked.
import { ONE_STEP_COMMANDS } from "@apc/policy-core";

export type CommandClass = "read" | "write-1step" | "preview" | "execute" | "unknown";
export type Classified = { cls: CommandClass; command: string; args: Record<string, string> };

const PREVIEW = ["contract-call preview", "sign-message preview"];
const EXECUTE = ["contract-call execute", "sign-message execute"];
// Reads, plus commands that only reduce exposure (revoke, cancel) or manage the CLI session.
const READ = [
  "approvals list", "approvals detail", "approvals revoke",
  "auth signin", "auth signout", "auth verify",
  "defi investment-info", "defi investment-list", "defi position", "defi preview", "defi protocol-info", "defi protocol-list",
  "limit-order list", "limit-order cancel",
  "market-order list", "market-order quote",
  "prediction category list", "prediction market detail", "prediction market last-trade-price", "prediction market list",
  "prediction market order-book", "prediction market search", "prediction order history", "prediction position list",
  "prediction position pnl", "prediction position portfolio", "prediction position settled-history", "prediction position token",
  "prediction trade quote", "prediction trade cancel",
  "sign-message history", "sign-message result",
  "wallet address", "wallet agent-id", "wallet balance", "wallet chains", "wallet gas-price", "wallet resolve-domain",
  "wallet settings", "wallet status", "wallet tx-history", "wallet cancel", "wallet left-quota", "skill-check", "cli-check", "wallet speed-up",
  "x402-payment preview",
];

// Flags each guarded preview/execute command may carry, from the official reference.
// Any other flag makes the command unknown, so the guard and the wallet never parse different input.
const FLAGS: Record<string, string[]> = {
  "contract-call preview": ["binanceChainId", "from", "to", "value", "inputData", "gasLimit", "json"],
  "sign-message preview": ["binanceChainId", "message", "signType", "json"],
  "contract-call execute": ["requestId", "json"],
  "sign-message execute": ["requestId", "json"],
};
const BOOLEAN_FLAGS = new Set(["json", "max"]);
const FLAG_NAME = /^[a-z][A-Za-z0-9]*$/;

function classOf(command: string): CommandClass {
  if (PREVIEW.includes(command)) return "preview";
  if (EXECUTE.includes(command)) return "execute";
  if (ONE_STEP_COMMANDS.includes(command)) return "write-1step";
  if (READ.includes(command)) return "read";
  return "unknown";
}

export function classify(argv: string[]): Classified {
  const words: string[] = [];
  let i = 0;
  while (i < argv.length && !argv[i]!.startsWith("--")) words.push(argv[i++]!);
  const command = words.join(" ");
  const args: Record<string, string> = {};
  const seen = new Set<string>();
  let bad = false;
  const allowed = FLAGS[command];
  while (i < argv.length) {
    const tok = argv[i]!;
    if (!tok.startsWith("--") || tok.includes("=")) {
      bad = true;
      i++;
      continue;
    }
    const key = tok.slice(2);
    if (!FLAG_NAME.test(key) || seen.has(key.toLowerCase()) || (allowed !== undefined && !allowed.includes(key))) bad = true;
    seen.add(key.toLowerCase());
    const next = argv[i + 1];
    if (!BOOLEAN_FLAGS.has(key) && next !== undefined && !next.startsWith("-")) {
      args[key] = next;
      i += 2;
    } else {
      args[key] = "true";
      i++;
    }
  }
  const cls = bad ? "unknown" : classOf(command);
  return { cls, command, args };
}
