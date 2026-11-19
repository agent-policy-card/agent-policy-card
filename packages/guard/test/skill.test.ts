import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = readFileSync(join(pkg, "SKILL.md"), "utf8");
const install = readFileSync(join(pkg, "scripts", "install.sh"), "utf8");

describe("SKILL.md", () => {
  it("never tells the agent to skip confirmation", () => {
    const lower = skill.toLowerCase();
    for (const banned of ["skip confirmation", "without confirmation", "auto-sign", "do not ask", "unless the user explicitly asks"]) {
      expect(lower).not.toContain(banned);
    }
  });

  it("routes the agent through the guard and explains blocks", () => {
    expect(skill).toContain("apc-baw");
    expect(skill).toContain("reasonCode");
    expect(skill).toContain("apc-confirm");
    expect(skill).toMatch(/^---\nname: agent-policy-card\ndescription: /);
  });

  it("contains no em dash", () => {
    expect(skill).not.toContain("—");
    expect(install).not.toContain("—");
  });
});

describe("install.sh", () => {
  it("is strict bash, writes config under ~/.agent-policy-card and never touches the real binary", () => {
    expect(install.startsWith("#!/usr/bin/env bash\nset -euo pipefail\n")).toBe(true);
    expect(install).toContain("$HOME/.agent-policy-card");
    expect(install).not.toMatch(/\brm\s+-rf\b/);
    expect(install).not.toMatch(/\bmv\b[^\n]*baw/);
  });
});
