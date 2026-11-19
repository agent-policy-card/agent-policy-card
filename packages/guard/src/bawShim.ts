// apc-baw: stands in front of the real wallet CLI. It runs the real binary itself and reads
// its output, so nothing the agent prints or pipes can change what the guard evaluates.
// Exit codes: 3 = blocked by policy, 4 = waiting for human confirmation (apc-confirm).
import { createHash } from "node:crypto";
import { evaluate, toIntent, type ChainState, type Decision } from "@apc/policy-core";
import { keccak256, stringToBytes } from "viem";
import { appendAudit } from "./audit.js";
import { readChainState as realReadChainState, readPaused as realReadPaused } from "./chain.js";
import { classify } from "./commands.js";
import type { Config } from "./config.js";
import { getEntry, putEntry } from "./state.js";

export type SpawnResult = { code: number; stdout: string; stderr: string };
export type ShimDeps = {
  cfg: Config | null;
  spawnBaw: (argv: string[]) => Promise<SpawnResult>;
  now: () => number;
  readChainState?: (cfg: Config, owner: string) => Promise<ChainState>;
  readPaused?: (cfg: Config, owner: string) => Promise<boolean | null>;
};

export const EXIT_BLOCKED = 3;
export const EXIT_PENDING = 4;

function intentHash(command: string, args: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(args).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return createHash("sha256").update(JSON.stringify({ command, args: sorted })).digest("hex");
}

function policyHash(chain: ChainState): string | null {
  return chain.ok && chain.card !== null ? keccak256(stringToBytes(chain.card.policyText)) : null;
}

function blocked(reasonCode: string, extraStderr = ""): SpawnResult {
  const stdout = JSON.stringify({ success: false, blockedBy: "agent-policy-card", reasonCode });
  const stderr = `${extraStderr}${extraStderr && !extraStderr.endsWith("\n") ? "\n" : ""}agent-policy-card: blocked (${reasonCode})\n`;
  return { code: EXIT_BLOCKED, stdout, stderr };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function runShim(argv: string[], deps: ShimDeps): Promise<SpawnResult> {
  const { cls, command, args } = classify(argv);
  if (cls === "read") return deps.spawnBaw(argv);

  const cfg = deps.cfg;
  if (cfg === null) return blocked("CHAIN_READ_FAILED", "agent-policy-card: guard is not configured (~/.agent-policy-card/config.json)");
  const readChain = deps.readChainState ?? ((c: Config, o: string) => realReadChainState(c, o));
  const readPaused = deps.readPaused ?? realReadPaused;
  const hash = intentHash(command, args);

  const audit = (d: Pick<Decision, "verdict" | "reasonCode" | "bucket">, requestId: string | null, ph: string | null) =>
    appendAudit(cfg, { ts: Math.floor(deps.now() / 1000), command, intentHash: hash, decision: d.verdict, reasonCode: d.reasonCode, policyHash: ph, requestId, bucket: d.bucket });
  const auditBlock = (reasonCode: Decision["reasonCode"], ph: string | null = null) =>
    audit({ verdict: "BLOCK", reasonCode, bucket: reasonCode === "OK" ? "allowed" : "other" }, null, ph);

  if (cls === "unknown") {
    auditBlock("UNKNOWN_COMMAND");
    return blocked("UNKNOWN_COMMAND");
  }
  if (args.from !== undefined && args.from.toLowerCase() !== cfg.wallet.toLowerCase()) {
    auditBlock("BLOCKED_OTHER");
    return blocked("BLOCKED_OTHER", "agent-policy-card: --from is not the guarded wallet");
  }

  if (cls === "execute") {
    const requestId = args.requestId;
    const entry = requestId === undefined ? null : getEntry(cfg, requestId);
    if (entry === null || entry.verdict !== "ALLOW_FOR_PREVIEW" || deps.now() >= entry.expiresAt) {
      auditBlock("BLOCKED_OTHER");
      return blocked("BLOCKED_OTHER", "agent-policy-card: this requestId was not approved by the guard, is waiting for apc-confirm, or has expired; run preview through apc-baw again");
    }
    if (!entry.cardCall) {
      const paused = await readPaused(cfg, cfg.wallet);
      if (paused !== false) {
        const reason = paused === true ? "AGENT_PAUSED" : "CHAIN_READ_FAILED";
        auditBlock(reason);
        return blocked(reason);
      }
    }
    return deps.spawnBaw(argv);
  }

  if (cls === "write-1step") {
    const chain = await readChain(cfg, cfg.wallet);
    const d = evaluate(toIntent(command, args, null), chain, cfg.cardContract);
    audit(d, null, policyHash(chain));
    return d.verdict === "ALLOW_FOR_PREVIEW" ? deps.spawnBaw(argv) : blocked(d.reasonCode);
  }

  // preview
  const runArgv = argv.includes("--json") ? argv : [...argv, "--json"];
  const res = await deps.spawnBaw(runArgv);
  let json: unknown;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    json = undefined;
  }
  if (res.code !== 0 || json === undefined) {
    auditBlock("MALFORMED_PREVIEW");
    const out = blocked("MALFORMED_PREVIEW", res.stderr);
    return res.code !== 0 ? { ...out, code: res.code } : out;
  }
  if (isObject(json) && json.success === false) {
    // The wallet refused or intercepted it: no requestId exists, pass its own answer through.
    auditBlock("MALFORMED_PREVIEW");
    return { code: EXIT_BLOCKED, stdout: res.stdout, stderr: res.stderr };
  }

  const chain = await readChain(cfg, cfg.wallet);
  const d = evaluate(toIntent(command, args, json), chain, cfg.cardContract);
  const data = isObject(json) && isObject(json.data) ? json.data : {};
  const requestId = typeof data.requestId === "string" ? data.requestId : null;
  const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : null;
  const ph = policyHash(chain);

  if (d.verdict === "BLOCK" || requestId === null || expiresAt === null) {
    const reason = d.verdict === "BLOCK" ? d.reasonCode : "MALFORMED_PREVIEW";
    audit({ verdict: "BLOCK", reasonCode: reason, bucket: d.verdict === "BLOCK" ? d.bucket : "other" }, null, ph);
    return blocked(reason);
  }

  putEntry(cfg, { requestId, verdict: d.verdict, reasonCode: d.reasonCode, cardCall: d.cardCall, expiresAt, intentHash: hash, ...(d.summary ? { summary: d.summary } : {}) }, deps.now());
  audit(d, requestId, ph);

  if (d.verdict === "PENDING_HUMAN_CONFIRM") {
    const stdout = JSON.stringify({
      success: false,
      blockedBy: "agent-policy-card",
      reasonCode: d.reasonCode,
      requestId,
      summary: d.summary ?? "",
      next: `Ask the user to run "apc-confirm ${requestId}" in their own terminal, then retry execute.`,
    });
    return { code: EXIT_PENDING, stdout, stderr: "" };
  }
  return res;
}
