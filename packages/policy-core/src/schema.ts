import { z } from "zod";
import type { PolicyV1 } from "./types.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/);

const entry = z
  .object({
    chainId: z.number().int().positive(),
    domainName: z.string(),
    verifyingContract: address.optional(),
    primaryType: z.string(),
  })
  .strict();

const policySchema = z
  .object({
    profile: z.string(),
    rules: z
      .object({
        allowedContracts: z.array(address),
        blockAuthorityChanges: z.boolean(),
        blockOnBinanceRisk: z.boolean(),
        blockSetApprovalForAll: z.boolean(),
        blockUnlimitedApprove: z.boolean(),
        deniedSelectors: z.array(selector),
        eip712: z
          .object({
            allow: z.array(entry),
            deny: z.array(z.string()).optional(),
            mode: z.enum(["allowlist", "denylist"]),
          })
          .strict(),
        maxNativeValueWei: z.string().regex(/^\d+$/),
        oneStep: z.object({ allow: z.array(z.string().min(1)) }).strict(),
        unknownCommand: z.literal("block"),
      })
      .strict(),
    v: z.literal(1),
  })
  .strict();

export function parsePolicy(
  text: string,
): { ok: true; policy: PolicyV1 } | { ok: false; error: string } {
  try {
    const result = policySchema.safeParse(JSON.parse(text));
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    return { ok: true, policy: result.data as PolicyV1 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid policy" };
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = sortValue(src[k]);
    }
    return out;
  }
  return value;
}

export function canonicalize(policy: PolicyV1): string {
  return JSON.stringify(sortValue(policy));
}
