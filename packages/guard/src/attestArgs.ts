// Argument parsing for apc-attest. Anything unexpected prints usage instead of running,
// so a mistyped flag never builds an attestation by accident.
export type AttestArgs =
  | { mode: "build" }
  | { mode: "proof"; periodEnd: number; index: number }
  | { mode: "usage"; error: string | null };

export const ATTEST_USAGE = "usage: apc-attest                      build the next attestation and print the prompt\n       apc-attest proof <periodEnd> <index>  print the Merkle proof for one audit line\n";

const NON_NEG_INT = /^\d+$/;

export function parseAttestArgs(argv: string[]): AttestArgs {
  if (argv.length === 0) return { mode: "build" };
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help")) return { mode: "usage", error: null };
  if (argv[0] === "proof") {
    const [, p, i, ...rest] = argv;
    if (p !== undefined && i !== undefined && rest.length === 0 && NON_NEG_INT.test(p) && NON_NEG_INT.test(i)) {
      return { mode: "proof", periodEnd: Number(p), index: Number(i) };
    }
    return { mode: "usage", error: "proof needs <periodEnd> <index> as non-negative integers" };
  }
  return { mode: "usage", error: `unknown argument: ${argv.join(" ")}` };
}
