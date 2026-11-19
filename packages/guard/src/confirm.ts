// apc-confirm: a human approves a pending card change by retyping a random code in a real
// terminal. This stops an agent that was tricked (its shell has no TTY); it cannot stop an
// agent that deliberately drives a pseudo-terminal as the same user.
import { randomInt } from "node:crypto";
import type { Config } from "./config.js";
import { getEntry, setVerdict } from "./state.js";

export type ConfirmIO = {
  isTTY: boolean;
  prompt: (question: string) => Promise<string>;
  print: (line: string) => void;
  randomCode: () => string;
  now: () => number;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function defaultRandomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export async function confirm(requestId: string, io: ConfirmIO, cfg: Config): Promise<number> {
  if (!io.isTTY) {
    io.print("apc-confirm must be run by a person in an interactive terminal.");
    return 2;
  }
  const entry = getEntry(cfg, requestId);
  if (entry === null || entry.verdict !== "PENDING_HUMAN_CONFIRM") {
    io.print(`No pending card change for requestId ${requestId}.`);
    return 1;
  }
  if (io.now() >= entry.expiresAt) {
    io.print("This request has expired. Run the preview again.");
    return 1;
  }
  io.print(`Pending change: ${entry.summary ?? "card change"}`);
  const code = io.randomCode();
  const answer = await io.prompt(`Type ${code} to approve, anything else to cancel: `);
  if (answer.trim() !== code) {
    io.print("Not approved.");
    return 1;
  }
  setVerdict(cfg, requestId, "ALLOW_FOR_PREVIEW");
  io.print("Approved. The agent may now run execute for this requestId; the wallet will still ask for its own confirmation.");
  return 0;
}
