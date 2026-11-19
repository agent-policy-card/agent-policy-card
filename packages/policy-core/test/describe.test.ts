import { describe, expect, it } from "vitest";
import { PRESETS, describePolicy } from "../src/index.js";
import type { PolicyV1 } from "../src/index.js";

describe("describePolicy", () => {
  it("describes eip712-shield", () => {
    expect(describePolicy(PRESETS["eip712-shield"])).toEqual([
      "Blocks every EIP-712 signature except allowlisted ones",
      "Blocks unlimited token approvals",
      "Blocks setApprovalForAll on NFT collections",
      "Blocks any change of token allowance or account authority",
      "Blocks calls the wallet preview flags as risky",
      "Max native value per call: 0.01 BNB",
      "One-step commands allowed: wallet send, market-order swap",
      "Unknown commands are always blocked",
    ]);
  });

  it("describes a denylist policy", () => {
    const p: PolicyV1 = {
      ...PRESETS["eip712-shield"],
      rules: {
        ...PRESETS["eip712-shield"].rules,
        eip712: { allow: [], deny: ["Permit", "PermitSingle"], mode: "denylist" },
      },
    };
    expect(describePolicy(p)).toContain("Blocks EIP-712 signatures of types: Permit, PermitSingle");
  });

  it("describes zero-spend", () => {
    const d = describePolicy(PRESETS["zero-spend"]);
    expect(d).toContain("No one-step write commands allowed");
    expect(d).toContain("Max native value per call: 0 BNB");
  });
});
