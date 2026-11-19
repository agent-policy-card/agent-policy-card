// Normalizes a wallet CLI command, its arguments and the preview JSON into one Intent.
// Never throws: anything that cannot be read becomes a "malformed" intent.
import { ONE_STEP_COMMANDS } from "./selectors.js";

export type TypedDataInfo = { domain: Record<string, unknown>; primaryType: string; message: unknown };

export type Intent =
  | { kind: "contractCall"; chainId: number; from: string; to: string; valueWei: bigint; inputData: string; preview: unknown }
  | { kind: "typedData"; command: "sign-message preview" | "x402-payment sign"; chainId: number | null; typedData: TypedDataInfo; preview: unknown | null }
  | { kind: "oneStep"; command: string; chainId: number | null; args: Record<string, string> }
  | { kind: "unknown"; command: string }
  | { kind: "malformed"; command: string; reason: string };

const HEX_DATA = /^0x([0-9a-fA-F]{2})*$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Parses --binanceChainId: decimal digits give a number, anything else (e.g. CT_501) gives -1, absent gives null. */
export function parseChainId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  return /^\d+$/.test(raw) ? Number(raw) : -1;
}

/** Parses a wei amount given as decimal or 0x-hex; returns null when invalid. */
export function parseWei(raw: string): bigint | null {
  if (/^\d+$/.test(raw) || /^0x[0-9a-fA-F]+$/.test(raw)) return BigInt(raw);
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extracts typed data from an eth_signTypedData_v4 request string. */
export function parseTypedDataMessage(raw: string | undefined): TypedDataInfo | null {
  if (raw === undefined) return null;
  try {
    const req: unknown = JSON.parse(raw);
    if (!isObject(req) || req.method !== "eth_signTypedData_v4" || !Array.isArray(req.params)) return null;
    const second: unknown = req.params[1];
    const td: unknown = typeof second === "string" ? JSON.parse(second) : second;
    if (!isObject(td) || !isObject(td.domain) || typeof td.primaryType !== "string") return null;
    return { domain: td.domain, primaryType: td.primaryType, message: td.message };
  } catch {
    return null;
  }
}

export function toIntent(command: string, args: Record<string, string>, previewJson: unknown | null): Intent {
  try {
    if (command === "contract-call preview") {
      const to = args.to;
      if (to === undefined || !ADDRESS.test(to)) return { kind: "malformed", command, reason: "missing or invalid --to" };
      const valueWei = parseWei(args.value ?? "0");
      if (valueWei === null) return { kind: "malformed", command, reason: "invalid --value" };
      const inputData = args.inputData ?? "0x";
      if (!HEX_DATA.test(inputData)) return { kind: "malformed", command, reason: "invalid --inputData" };
      return {
        kind: "contractCall",
        chainId: parseChainId(args.binanceChainId) ?? -1,
        from: args.from ?? "",
        to,
        valueWei,
        inputData,
        preview: previewJson,
      };
    }
    if (command === "sign-message preview" || command === "x402-payment sign") {
      const typedData = parseTypedDataMessage(args.message);
      if (typedData === null) return { kind: "malformed", command, reason: "unreadable typed data" };
      return { kind: "typedData", command, chainId: parseChainId(args.binanceChainId), typedData, preview: previewJson };
    }
    if (ONE_STEP_COMMANDS.includes(command)) {
      return { kind: "oneStep", command, chainId: parseChainId(args.binanceChainId), args };
    }
    return { kind: "unknown", command };
  } catch {
    return { kind: "malformed", command, reason: "unexpected error" };
  }
}
