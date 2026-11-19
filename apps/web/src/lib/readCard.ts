import { CARD_ABI, describePolicy, parsePolicy } from "@apc/policy-core";
import type { PublicClient } from "viem";

export type CardAttestation = {
  epoch: number;
  allowedCount: number;
  totalBlocked: number;
  logMerkleRoot: string;
  periodStart: number;
  periodEnd: number;
  submittedAt: number;
};

export type CardData = {
  status: "ACTIVE" | "PAUSED" | "NONE";
  version: number;
  rules: string[];
  policyText: string;
  guardian: string | null;
  updatedAt: number;
  attestation: CardAttestation | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isAddress0x(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

export async function readCard(
  address: string,
  client: Pick<PublicClient, "readContract">,
  cardContract: string,
): Promise<CardData | { error: string }> {
  if (!isAddress0x(address)) return { error: "Not a 0x address" };
  try {
    const owner = address as `0x${string}`;
    const contract = cardContract as `0x${string}`;
    const card = await client.readContract({ address: contract, abi: CARD_ABI, functionName: "getCard", args: [owner] });
    const att = await client.readContract({
      address: contract,
      abi: CARD_ABI,
      functionName: "getLatestAttestation",
      args: [owner],
    });

    const version = Number(card.version);
    if (version === 0) {
      return { status: "NONE", version: 0, rules: [], policyText: "", guardian: null, updatedAt: 0, attestation: null };
    }

    const parsed = parsePolicy(card.policyText);
    const rules = parsed.ok ? describePolicy(parsed.policy) : ["Policy text is unreadable"];
    const guardian = card.guardian.toLowerCase() === ZERO_ADDRESS ? null : card.guardian;
    const attestation: CardAttestation | null =
      Number(att.epoch) === 0
        ? null
        : {
            epoch: Number(att.epoch),
            allowedCount: Number(att.allowedCount),
            totalBlocked:
              Number(att.blockedEip712) +
              Number(att.blockedApprove) +
              Number(att.blockedSelector) +
              Number(att.blockedOther),
            logMerkleRoot: att.logMerkleRoot,
            periodStart: Number(att.periodStart),
            periodEnd: Number(att.periodEnd),
            submittedAt: Number(att.submittedAt),
          };

    return {
      status: card.paused ? "PAUSED" : "ACTIVE",
      version,
      rules,
      policyText: card.policyText,
      guardian,
      updatedAt: Number(card.updatedAt),
      attestation,
    };
  } catch {
    return { error: "Could not read the card from the chain" };
  }
}
