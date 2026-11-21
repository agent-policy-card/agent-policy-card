import { describe, expect, it } from "vitest";
import { parseAttestArgs } from "../src/attestArgs.js";

describe("parseAttestArgs", () => {
  it("no arguments builds an attestation", () => {
    expect(parseAttestArgs([])).toEqual({ mode: "build" });
  });

  it("proof needs two non-negative integers", () => {
    expect(parseAttestArgs(["proof", "1795269848", "0"])).toEqual({ mode: "proof", periodEnd: 1795269848, index: 0 });
    for (const bad of [["proof"], ["proof", "x", "0"], ["proof", "1", "-1"], ["proof", "1", "1.5"], ["proof", "1", "2", "3"]]) {
      expect(parseAttestArgs(bad).mode).toBe("usage");
    }
  });

  it("--help and any unknown argument print usage instead of running", () => {
    expect(parseAttestArgs(["--help"])).toEqual({ mode: "usage", error: null });
    expect(parseAttestArgs(["-h"])).toEqual({ mode: "usage", error: null });
    const r = parseAttestArgs(["--dry-run"]);
    expect(r.mode).toBe("usage");
    expect(r.mode === "usage" && r.error).toContain("--dry-run");
  });
});
