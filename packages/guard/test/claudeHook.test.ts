import { describe, expect, it } from "vitest";
import { checkBash, handleHookInput } from "../src/claudeHook.js";

const REASON = "Use the guard: run apc-baw <arguments> as a plain command, without pipes, redirects, chaining or substitutions.";

const allowed = [
  "apc-baw contract-call preview --binanceChainId 56 --json",
  `apc-baw sign-message preview --binanceChainId 56 --signType EIP712 --message '{"method":"eth_signTypedData_v4","params":["0x1111111111111111111111111111111111111111","{\\"a\\":1}"]}' --json`,
  "ls -la",
  "git status",
  "echo hello",
  "cat README.md",
];

const denied = [
  "baw wallet send --amount 1",
  "/usr/local/bin/baw wallet balance",
  "./apc-baw wallet balance",
  "apc-baw wallet balance | jq .",
  "apc-baw wallet balance > out.json",
  'sh -c "apc-baw wallet balance"',
  "bash -lc 'baw wallet balance'",
  "$(which baw) wallet send",
  "apc-baw wallet balance; baw wallet send",
  "apc-baw wallet balance && baw wallet send",
  "npx baw wallet send",
  "env baw wallet send",
  "FOO=1 apc-baw wallet balance",
  "sudo apc-baw wallet balance",
  "apc-guard wallet send",
  "apc-baw wallet balance & ",
  'apc-baw "unbalanced',
  "apc-baw wallet balance\nbaw wallet send",
  "apc-baw wallet balance\r\nbaw wallet send",
  "cd /tmp && baw wallet balance",
  "exec baw wallet balance",
  "apc-baw send --to '$HOME'",
];

describe("checkBash", () => {
  for (const c of allowed) {
    it(`allows ${JSON.stringify(c)}`, () => {
      expect(checkBash(c)).toEqual({ allow: true });
    });
  }
  for (const c of denied) {
    it(`denies ${JSON.stringify(c)}`, () => {
      expect(checkBash(c)).toEqual({ allow: false, reason: REASON });
    });
  }
});

const deny = (reason: string) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

describe("handleHookInput", () => {
  it("allows non-Bash tools", () => {
    expect(handleHookInput(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } }))).toBe("");
  });
  it("allows a safe Bash command", () => {
    expect(handleHookInput(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls -la" } }))).toBe("");
  });
  it("denies a bad Bash command with the exact JSON", () => {
    expect(handleHookInput(JSON.stringify({ tool_name: "Bash", tool_input: { command: "baw wallet send" } }))).toBe(deny(REASON));
  });
  it("denies unparseable input", () => {
    const out = JSON.parse(handleHookInput("not json"));
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });
  it("denies Bash without a command", () => {
    const out = JSON.parse(handleHookInput(JSON.stringify({ tool_name: "Bash", tool_input: {} })));
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });
  it("denies missing tool_name", () => {
    const out = JSON.parse(handleHookInput(JSON.stringify({ tool_input: { command: "ls" } })));
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});

describe("quote and escape obfuscation", () => {
  it.each([
    ["'b'aw wallet send --amount 1"],
    ['ba""w wallet send --amount 1'],
    ["b\\aw wallet send --amount 1"],
    ["/usr/local/bin/'baw' wallet send"],
    ["apc-baw wallet balance; 'b'aw wallet send"],
  ])("denies %s", (cmd) => {
    expect(checkBash(cmd).allow).toBe(false);
  });
});
