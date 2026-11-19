// Entry point for the Claude Code PreToolUse hook. Always exits 0; the verdict is in stdout.
import { handleHookInput } from "../src/claudeHook.js";

const chunks: Buffer[] = [];
process.stdin.on("data", (b: Buffer) => chunks.push(b));
process.stdin.on("error", () => {
  process.stdout.write(handleHookInput(""));
  process.exitCode = 0;
});
process.stdin.on("end", () => {
  process.stdout.write(handleHookInput(Buffer.concat(chunks).toString("utf8")));
  process.exitCode = 0;
});
