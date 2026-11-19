import { CARD_ABI } from "@apc/policy-core";
import { encodeFunctionData, isAddress, type Hex } from "viem";

export type GuardianState =
  | { kind: "invalid-agent" }
  | { kind: "no-card" }
  | { kind: "no-guardian" }
  | { kind: "not-guardian"; guardian: string }
  | { kind: "already-paused" }
  | { kind: "can-pause" };

export function guardianState(
  agent: string,
  card: { version: number; paused: boolean; guardian: string | null } | null,
  connected: string | null,
): GuardianState {
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent)) return { kind: "invalid-agent" };
  if (!card || card.version === 0) return { kind: "no-card" };
  if (card.guardian === null) return { kind: "no-guardian" };
  if (connected === null || connected.toLowerCase() !== card.guardian.toLowerCase()) {
    return { kind: "not-guardian", guardian: card.guardian };
  }
  if (card.paused) return { kind: "already-paused" };
  return { kind: "can-pause" };
}

export function buildPauseCalldata(agent: string): Hex {
  if (!isAddress(agent, { strict: false })) throw new Error("Invalid agent address");
  return encodeFunctionData({ abi: CARD_ABI, functionName: "pause", args: [agent] });
}
