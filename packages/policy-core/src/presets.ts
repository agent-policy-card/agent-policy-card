import type { PolicyV1 } from "./types.js";

function shield(): PolicyV1 {
  return {
    profile: "eip712-shield",
    rules: {
      allowedContracts: [],
      blockAuthorityChanges: true,
      blockOnBinanceRisk: true,
      blockSetApprovalForAll: true,
      blockUnlimitedApprove: true,
      deniedSelectors: [],
      eip712: { allow: [], mode: "allowlist" },
      maxNativeValueWei: "10000000000000000",
      oneStep: { allow: ["wallet send", "market-order swap"] },
      unknownCommand: "block",
    },
    v: 1,
  };
}

const zero = shield();
zero.profile = "zero-spend";
zero.rules.maxNativeValueWei = "0";
zero.rules.oneStep.allow = [];

const strict = shield();
strict.profile = "strict-allowlist";

export const PRESETS: Record<"eip712-shield" | "zero-spend" | "strict-allowlist", PolicyV1> = {
  "eip712-shield": shield(),
  "zero-spend": zero,
  "strict-allowlist": strict,
};
