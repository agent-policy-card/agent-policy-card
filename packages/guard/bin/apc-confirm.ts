// Entry point for apc-confirm <requestId>.
import { createInterface } from "node:readline/promises";
import { confirm, defaultRandomCode } from "../src/confirm.js";
import { loadConfig } from "../src/config.js";

async function main(): Promise<number> {
  const requestId = process.argv[2];
  if (requestId === undefined) {
    process.stderr.write("usage: apc-confirm <requestId>\n");
    return 1;
  }
  const cfg = loadConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await confirm(
      requestId,
      {
        isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
        prompt: (q) => rl.question(q),
        print: (l) => process.stdout.write(`${l}\n`),
        randomCode: defaultRandomCode,
        now: Date.now,
      },
      cfg,
    );
  } finally {
    rl.close();
  }
}

main()
  .then((code) => (process.exitCode = code))
  .catch((e: unknown) => {
    process.stderr.write(`apc-confirm: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
