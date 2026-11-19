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
  "wallet settings", "wallet status", "wallet tx-history", "wallet cancel", "wallet speed-up",
  "x402-payment preview",
];

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
  let repeated = false;
  let stray = false;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (!tok.startsWith("--") || tok.includes("=")) {
      stray = true;
      i++;
      continue;
    }
    const key = tok.slice(2);
    if (key in args) repeated = true;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 2;
    } else {
      args[key] = "true";
      i++;
    }
  }
  const cls = repeated || stray ? "unknown" : classOf(command);
  return { cls, command, args };
}
