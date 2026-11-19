// Claude Code PreToolUse hook: the agent may reach the wallet CLI only through `apc-baw`
// called as a plain command with literal arguments. Fails closed.

export type HookVerdict = { allow: true } | { allow: false; reason: string };

const REASON = "Use the guard: run apc-baw <arguments> as a plain command, without pipes, redirects, chaining or substitutions.";
const WALLET_NAMES = new Set(["baw", "apc-baw", "apc-guard"]);
const DENY: HookVerdict = { allow: false, reason: REASON };

function basename(token: string): string {
  const i = token.lastIndexOf("/");
  return i === -1 ? token : token.slice(i + 1);
}

// Quotes and backslashes are removed first: bash turns 'b'aw, ba""w and b\aw into baw.
function mentionsWallet(command: string): boolean {
  return command
    .replace(/['"\\]/g, "")
    .split(/[\s|&;()`<>$={}]+/)
    .some((t) => WALLET_NAMES.has(basename(t)));
}

// Scans quotes. Returns false for unbalanced quotes or forbidden characters.
// Forbidden anywhere: | & ; < > ` $ ( ) newline CR.
// Forbidden outside single quotes: backslash, braces (JSON payloads live inside single quotes).
function isPlain(command: string): boolean {
  let quote: "'" | '"' | null = null;
  for (const ch of command) {
    if ("|&;<>`$()\n\r".includes(ch)) return false;
    if (quote === null) {
      if (ch === "'" || ch === '"') quote = ch;
      else if (ch === "\\" || ch === "{" || ch === "}") return false;
    } else if (ch === quote) {
      quote = null;
    } else if (quote === '"' && ch === "\\") {
      return false;
    }
  }
  return quote === null;
}

export function checkBash(command: string): HookVerdict {
  if (!mentionsWallet(command)) return { allow: true };
  const trimmed = command.trim();
  if (!isPlain(trimmed)) return DENY;
  const tokens = trimmed.split(/\s+/);
  if (tokens[0] !== "apc-baw") return DENY;
  // Any further mention of the wallet names as a bare word is denied.
  const rest = tokens.slice(1).join(" ");
  if (mentionsWallet(rest)) return DENY;
  return { allow: true };
}

function denyJson(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  });
}

export function handleHookInput(stdinText: string): string {
  try {
    const input: unknown = JSON.parse(stdinText);
    if (typeof input !== "object" || input === null) return denyJson("Hook input is not a JSON object.");
    const { tool_name, tool_input } = input as { tool_name?: unknown; tool_input?: unknown };
    if (typeof tool_name !== "string") return denyJson("Hook input has no tool_name.");
    if (tool_name !== "Bash") return "";
    const command = (tool_input as { command?: unknown } | null | undefined)?.command;
    if (typeof command !== "string") return denyJson("Bash tool call has no command string.");
    const verdict = checkBash(command);
    return verdict.allow ? "" : denyJson(verdict.reason);
  } catch {
    return denyJson("Hook input could not be parsed.");
  }
}
