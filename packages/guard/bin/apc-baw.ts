// Entry point for apc-baw (also installed as apc-guard, or as "baw" ahead of the real binary on PATH).
import { spawn } from "node:child_process";
import { runShim, type SpawnResult } from "../src/bawShim.js";
import { loadConfig, type Config } from "../src/config.js";

function load(): Config | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

function spawnWith(cfg: Config | null) {
  return (argv: string[]): Promise<SpawnResult> =>
    new Promise((resolve) => {
      if (cfg === null) {
        resolve({ code: 3, stdout: "", stderr: "agent-policy-card: guard is not configured (~/.agent-policy-card/config.json)\n" });
        return;
      }
      const child = spawn(cfg.realBaw, argv, { stdio: ["inherit", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (b: Buffer) => (stdout += b.toString("utf8")));
      child.stderr.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
      child.on("error", (e) => resolve({ code: 3, stdout: "", stderr: `agent-policy-card: cannot run wallet CLI: ${e.message}\n` }));
      child.on("close", (code) => resolve({ code: code ?? 3, stdout, stderr }));
    });
}

const cfg = load();
runShim(process.argv.slice(2), { cfg, spawnBaw: spawnWith(cfg), now: Date.now })
  .then((r) => {
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    process.exitCode = r.code;
  })
  .catch((e: unknown) => {
    process.stderr.write(`agent-policy-card: blocked (internal error: ${e instanceof Error ? e.message : String(e)})\n`);
    process.exitCode = 3;
  });
