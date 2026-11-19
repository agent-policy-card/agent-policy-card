import { formatEther } from "viem";
import type { PolicyV1 } from "./types.js";

export function describePolicy(policy: PolicyV1): string[] {
  const r = policy.rules;
  const out: string[] = [];
  if (r.eip712.mode === "allowlist") {
    out.push("Blocks every EIP-712 signature except allowlisted ones");
    if (r.eip712.allow.length > 0) {
      out.push(`Allowlisted EIP-712 signatures: ${r.eip712.allow.length}`);
    }
  } else {
    out.push(`Blocks EIP-712 signatures of types: ${(r.eip712.deny ?? []).join(", ")}`);
  }
  if (r.blockUnlimitedApprove) out.push("Blocks unlimited token approvals");
  if (r.blockSetApprovalForAll) out.push("Blocks setApprovalForAll on NFT collections");
  if (r.blockAuthorityChanges) {
    out.push("Blocks any change of token allowance or account authority");
  }
  if (r.blockOnBinanceRisk) out.push("Blocks calls the wallet preview flags as risky");
  out.push(`Max native value per call: ${formatEther(BigInt(r.maxNativeValueWei))} BNB`);
  if (r.allowedContracts.length > 0) {
    out.push(`Only these contracts may be called: ${r.allowedContracts.length} listed`);
  }
  if (r.deniedSelectors.length > 0) {
    out.push(`Blocked function selectors: ${r.deniedSelectors.join(", ")}`);
  }
  if (r.oneStep.allow.length === 0) {
    out.push("No one-step write commands allowed");
  } else {
    out.push(`One-step commands allowed: ${r.oneStep.allow.join(", ")}`);
  }
  out.push("Unknown commands are always blocked");
  return out;
}
