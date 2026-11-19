import { describe, expect, it } from "vitest";
import { evaluate, toIntent, type ChainState, type Decision, type Intent } from "../src/evaluate.js";
import { PRESETS } from "../src/presets.js";
import {
  CARD,
  CHAIN_DOWN,
  NO_CARD,
  PERMIT_TD,
  PERMIT2,
  SPENDER,
  TOKEN,
  WALLET,
  calldata,
  chainWith,
  contractArgs,
  contractPreview,
  risk,
  signArgs,
  signPreview,
  typedData,
  withPolicy,
} from "./fixtures.js";

const CARD_CHECKSUM = "0x2222222222222222222222222222222222222222";

function call(inputData: string, opts: { to?: string; value?: string; chain?: string; preview?: unknown } = {}): Intent {
  return toIntent(
    "contract-call preview",
    contractArgs(opts.to ?? TOKEN, inputData, opts.value ?? "0", opts.chain ?? "56"),
    opts.preview === undefined ? contractPreview() : opts.preview,
  );
}

function sign(td: object, opts: { chain?: string; preview?: unknown } = {}): Intent {
  return toIntent("sign-message preview", signArgs(td, opts.chain ?? "56"), opts.preview === undefined ? signPreview() : opts.preview);
}

function run(intent: Intent, chain: ChainState = chainWith()): Decision {
  return evaluate(intent, chain, CARD_CHECKSUM);
}

describe("step 0: calls to the card contract", () => {
  it("allows the first publishCard when no card exists", () => {
    const d = run(call(calldata.publishCard(), { to: CARD }), NO_CARD);
    expect(d).toMatchObject({ verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", cardCall: true, bucket: "allowed" });
  });

  it("needs a human for a publishCard update", () => {
    const d = run(call(calldata.publishCard(), { to: CARD }), chainWith(PRESETS["eip712-shield"], { version: 3 }));
    expect(d).toMatchObject({ verdict: "PENDING_HUMAN_CONFIRM", reasonCode: "CARD_CHANGE_NEEDS_HUMAN", cardCall: true, bucket: "none" });
    expect(d.summary).toContain("publishCard");
  });

  it("treats publishCard as an update when the chain cannot be read", () => {
    const d = run(call(calldata.publishCard(), { to: CARD }), CHAIN_DOWN);
    expect(d.verdict).toBe("PENDING_HUMAN_CONFIRM");
  });

  it("asks a human for unpause even when paused and the policy is broken", () => {
    const d = run(call(calldata.unpause(), { to: CARD }), chainWith("{broken", { paused: true }));
    expect(d).toMatchObject({ verdict: "PENDING_HUMAN_CONFIRM", reasonCode: "CARD_CHANGE_NEEDS_HUMAN" });
  });

  it("asks a human for setGuardian while paused", () => {
    const d = run(call(calldata.setGuardian(), { to: CARD }), chainWith(PRESETS["zero-spend"], { paused: true }));
    expect(d.verdict).toBe("PENDING_HUMAN_CONFIRM");
    expect(d.summary).toContain(SPENDER.toLowerCase());
  });

  it("lets pause and submitAttestation through even when the chain is down", () => {
    expect(run(call(calldata.pause(), { to: CARD }), CHAIN_DOWN)).toMatchObject({ verdict: "ALLOW_FOR_PREVIEW", cardCall: true });
    expect(run(call(calldata.submitAttestation(), { to: CARD }), CHAIN_DOWN)).toMatchObject({ verdict: "ALLOW_FOR_PREVIEW" });
  });

  it("matches the card address case-insensitively", () => {
    const d = evaluate(call(calldata.unpause(), { to: CARD.toUpperCase().replace("0X", "0x") }), chainWith(), CARD.toLowerCase());
    expect(d.verdict).toBe("PENDING_HUMAN_CONFIRM");
  });

  it("blocks unknown selectors to the card contract", () => {
    expect(run(call(calldata.transfer(), { to: CARD }))).toMatchObject({ verdict: "BLOCK", reasonCode: "BLOCKED_OTHER" });
  });

  it("blocks a card call whose preview failed", () => {
    const d = run(call(calldata.pause(), { to: CARD, preview: { success: false, error: { code: 1 } } }));
    expect(d).toMatchObject({ verdict: "BLOCK", reasonCode: "MALFORMED_PREVIEW" });
  });
});

describe("steps 1 to 4: chain, card, pause, policy", () => {
  it("blocks other chains", () => {
    expect(run(call(calldata.transfer(), { chain: "97" })).reasonCode).toBe("UNSUPPORTED_CHAIN");
    expect(run(call(calldata.transfer(), { chain: "CT_501" })).reasonCode).toBe("UNSUPPORTED_CHAIN");
    expect(run(sign(PERMIT_TD, { chain: "1" })).reasonCode).toBe("UNSUPPORTED_CHAIN");
  });

  it("blocks writes when the chain cannot be read", () => {
    expect(run(call(calldata.transfer()), CHAIN_DOWN)).toMatchObject({ verdict: "BLOCK", reasonCode: "CHAIN_READ_FAILED", bucket: "other" });
  });

  it("blocks writes without a card", () => {
    expect(run(call(calldata.transfer()), NO_CARD).reasonCode).toBe("NO_CARD");
  });

  it("blocks writes while paused", () => {
    expect(run(call(calldata.transfer()), chainWith(PRESETS["eip712-shield"], { paused: true })).reasonCode).toBe("AGENT_PAUSED");
  });

  it("blocks when the policy is unreadable", () => {
    expect(run(call(calldata.transfer()), chainWith("{not json")).reasonCode).toBe("POLICY_UNREADABLE");
    expect(run(call(calldata.transfer()), chainWith('{"v":2}')).reasonCode).toBe("POLICY_UNREADABLE");
  });
});

describe("step 5: command table", () => {
  it("blocks unknown commands", () => {
    expect(run(toIntent("wallet rm-rf", {}, null))).toMatchObject({ verdict: "BLOCK", reasonCode: "UNKNOWN_COMMAND" });
  });

  it("blocks one-step commands not in oneStep.allow", () => {
    expect(run(toIntent("defi deposit", {}, null)).reasonCode).toBe("BLOCKED_COMMAND");
    expect(run(toIntent("wallet send", {}, null), chainWith(PRESETS["zero-spend"])).reasonCode).toBe("BLOCKED_COMMAND");
  });

  it("allows one-step commands in oneStep.allow", () => {
    expect(run(toIntent("wallet send", { amount: "1" }, null))).toMatchObject({ verdict: "ALLOW_FOR_PREVIEW", bucket: "allowed" });
  });

  it("hard rule: unknownCommand is never read from the policy", () => {
    const loose = withPolicy((p) => {
      (p.rules as { unknownCommand: string }).unknownCommand = "allow";
    });
    const text = JSON.stringify(loose);
    expect(run(toIntent("wallet rm-rf", {}, null), chainWith(text)).verdict).toBe("BLOCK");
  });
});

describe("step 6: EIP-712", () => {
  it("blocks a Permit under the default allowlist", () => {
    expect(run(sign(PERMIT_TD))).toMatchObject({ verdict: "BLOCK", reasonCode: "BLOCKED_EIP712", bucket: "eip712" });
  });

  it("allows a typed data that matches an allow entry, addresses compared case-insensitively", () => {
    const p = withPolicy((x) => {
      x.rules.eip712.allow = [{ chainId: 56, domainName: "USD Coin", verifyingContract: TOKEN.toUpperCase().replace("0X", "0x"), primaryType: "Permit" }];
    });
    expect(run(sign(PERMIT_TD), chainWith(p)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("does not match an allow entry on another chainId", () => {
    const p = withPolicy((x) => {
      x.rules.eip712.allow = [{ chainId: 1, domainName: "USD Coin", verifyingContract: TOKEN, primaryType: "Permit" }];
    });
    expect(run(sign(PERMIT_TD), chainWith(p)).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("blocks typed data whose domain chainId is not 56, even in denylist mode", () => {
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: ["Permit"], mode: "denylist" };
    });
    const td = typedData({ name: "Mail", chainId: 1, verifyingContract: TOKEN, primaryType: "Mail" });
    expect(run(sign(td), chainWith(p)).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("denylist blocks listed types and passes others", () => {
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: ["Permit", "PermitWitnessTransferFrom"], mode: "denylist" };
    });
    const witness = typedData({ name: "Permit2", chainId: 56, verifyingContract: PERMIT2, primaryType: "PermitWitnessTransferFrom" });
    const mail = typedData({ name: "Mail", chainId: "0x38", verifyingContract: TOKEN, primaryType: "Mail" });
    expect(run(sign(witness), chainWith(p)).reasonCode).toBe("BLOCKED_EIP712");
    expect(run(sign(mail), chainWith(p)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("denylist blocks a non-listed type whose parsed message grants authority", () => {
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: ["Permit"], mode: "denylist" };
    });
    const td = typedData({ name: "X", chainId: 56, verifyingContract: TOKEN, primaryType: "Order" });
    const d = run(sign(td, { preview: signPreview({ spender: SPENDER, details: [{ token: TOKEN, amount: "1" }] }) }), chainWith(p));
    expect(d.reasonCode).toBe("BLOCKED_APPROVE");
  });

  it("x402 needs oneStep.allow and the EIP-712 rule", () => {
    const args = signArgs(PERMIT_TD);
    expect(run(toIntent("x402-payment sign", args, null)).reasonCode).toBe("BLOCKED_COMMAND");
    const p = withPolicy((x) => {
      x.rules.oneStep.allow = ["x402-payment sign"];
    });
    expect(run(toIntent("x402-payment sign", args, null), chainWith(p)).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("blocks an unparseable --message", () => {
    const i = toIntent("sign-message preview", { binanceChainId: "56", signType: "EIP712", message: "not json" }, signPreview());
    expect(run(i).reasonCode).toBe("MALFORMED_PREVIEW");
  });
});

describe("step 7: approvals and authority", () => {
  it("blocks approve of MAX_UINT256", () => {
    expect(run(call(calldata.approveMax()))).toMatchObject({ verdict: "BLOCK", reasonCode: "BLOCKED_APPROVE", bucket: "approve" });
  });

  it("blocks approve at or above 2^128 and allows a small approve without authority changes", () => {
    expect(run(call(calldata.approve(2n ** 128n))).reasonCode).toBe("BLOCKED_APPROVE");
    const noAuthority = withPolicy((p) => {
      p.rules.blockAuthorityChanges = false;
    });
    expect(run(call(calldata.approve(1000n)), chainWith(noAuthority)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("blocks setApprovalForAll(true) and allows revoking with (false)", () => {
    expect(run(call(calldata.setApprovalForAll(true))).reasonCode).toBe("BLOCKED_APPROVE");
    expect(run(call(calldata.setApprovalForAll(false))).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("blocks when the simulation reports authority or allowance changes", () => {
    expect(run(call(calldata.transfer(), { preview: contractPreview({ authorityChanges: [{ x: 1 }] }) })).reasonCode).toBe("BLOCKED_APPROVE");
    expect(run(call(calldata.transfer(), { preview: contractPreview({ allowanceChanges: [{ x: 1 }] }) })).reasonCode).toBe("BLOCKED_APPROVE");
  });
});

describe("step 8: wallet preview risk", () => {
  it("blocks on a transaction-level RISK item", () => {
    const d = run(call(calldata.transfer(), { preview: contractPreview({ riskDetails: [risk("RISK")] }) }));
    expect(d).toMatchObject({ reasonCode: "BLOCKED_BINANCE_RISK", bucket: "other" });
  });

  it("blocks on an address-level RISK item", () => {
    const preview = contractPreview({ addresses: { [SPENDER]: { riskLevel: 5, riskDetails: [risk("RISK")] } } });
    expect(run(call(calldata.transfer(), { preview })).reasonCode).toBe("BLOCKED_BINANCE_RISK");
  });

  it("ignores CAUTION items and respects blockOnBinanceRisk=false", () => {
    expect(run(call(calldata.transfer(), { preview: contractPreview({ riskDetails: [risk("CAUTION")] }) })).verdict).toBe("ALLOW_FOR_PREVIEW");
    const off = withPolicy((p) => {
      p.rules.blockOnBinanceRisk = false;
    });
    expect(run(call(calldata.transfer(), { preview: contractPreview({ riskDetails: [risk("RISK")] }) }), chainWith(off)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });
});

describe("step 9: value, selectors, contracts", () => {
  it("blocks value above maxNativeValueWei, accepting hex values", () => {
    expect(run(call("0x", { value: "10000000000000001" })).reasonCode).toBe("BLOCKED_OTHER");
    expect(run(call("0x", { value: "0x2386f26fc10000" })).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("blocks denied selectors", () => {
    const p = withPolicy((x) => {
      x.rules.deniedSelectors = ["0xA9059CBB"];
    });
    expect(run(call(calldata.transfer()), chainWith(p))).toMatchObject({ reasonCode: "BLOCKED_SELECTOR", bucket: "selector" });
  });

  it("blocks targets outside allowedContracts, compared case-insensitively", () => {
    const p = withPolicy((x) => {
      x.rules.allowedContracts = [SPENDER];
    });
    expect(run(call(calldata.transfer()), chainWith(p)).reasonCode).toBe("BLOCKED_OTHER");
    expect(run(call(calldata.transfer(), { to: SPENDER.toUpperCase().replace("0X", "0x") }), chainWith(p)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });
});

describe("malformed input fails closed", () => {
  it("blocks previews missing fields the rules read", () => {
    const base = contractPreview() as { data: Record<string, unknown> };
    for (const key of ["simulationResult", "risks", "requestId"]) {
      const broken = structuredClone(base);
      delete broken.data[key];
      expect(run(call(calldata.transfer(), { preview: broken })).reasonCode).toBe("MALFORMED_PREVIEW");
    }
    const noAuth = structuredClone(base) as { data: { simulationResult: Record<string, unknown> } };
    delete noAuth.data.simulationResult.authorityChanges;
    expect(run(call(calldata.transfer(), { preview: noAuth })).reasonCode).toBe("MALFORMED_PREVIEW");
  });

  it("blocks success:false previews and missing previews", () => {
    expect(run(call(calldata.transfer(), { preview: { success: false } })).reasonCode).toBe("MALFORMED_PREVIEW");
    expect(run(call(calldata.transfer(), { preview: null })).reasonCode).toBe("MALFORMED_PREVIEW");
    expect(run(sign(PERMIT_TD, { preview: { success: true, data: { requestId: "r" } } })).reasonCode).toBe("MALFORMED_PREVIEW");
  });

  it("blocks bad numeric arguments", () => {
    expect(run(call("0x", { value: "1.5" })).reasonCode).toBe("MALFORMED_PREVIEW");
    expect(run(call("0x", { value: "-1" })).reasonCode).toBe("MALFORMED_PREVIEW");
    expect(run(toIntent("contract-call preview", { binanceChainId: "56", from: WALLET, value: "0" }, contractPreview())).reasonCode).toBe(
      "MALFORMED_PREVIEW",
    );
  });

  it("never throws on random input", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const junk = (depth = 0): unknown => {
      const r = rnd();
      if (depth > 3 || r < 0.15) return null;
      if (r < 0.3) return "x";
      if (r < 0.45) return 42;
      if (r < 0.6) return [junk(depth + 1)];
      const d = depth + 1;
      return { success: rnd() < 0.5, data: rnd() < 0.5 ? junk(d) : { requestId: junk(d), risks: junk(d), simulationResult: junk(d), parsedMessage: junk(d) } };
    };
    const commands = ["contract-call preview", "sign-message preview", "x402-payment sign", "wallet send", "nope"];
    const valid = new Set(["ALLOW_FOR_PREVIEW", "BLOCK", "PENDING_HUMAN_CONFIRM"]);
    for (let i = 0; i < 200; i++) {
      const args: Record<string, string> = {
        binanceChainId: rnd() < 0.8 ? "56" : "x",
        to: rnd() < 0.3 ? CARD : TOKEN,
        value: rnd() < 0.8 ? "0" : "zz",
        inputData: rnd() < 0.5 ? calldata.approveMax() : "0x" + "f".repeat(Math.floor(rnd() * 12)),
        message: rnd() < 0.5 ? "{}" : JSON.stringify({ method: "eth_signTypedData_v4", params: [WALLET, junk()] }),
      };
      const chains: ChainState[] = [chainWith(), NO_CARD, CHAIN_DOWN, chainWith("{")];
      const cmd = commands[Math.floor(rnd() * commands.length)]!;
      const intent = toIntent(cmd, args, junk());
      const d = evaluate(intent, chains[Math.floor(rnd() * chains.length)]!, CARD);
      expect(valid.has(d.verdict)).toBe(true);
    }
  });
});

describe("a clean contract call passes everything", () => {
  it("allows a value-0 call with an empty preview risk list", () => {
    expect(run(call(calldata.transfer()))).toEqual({ verdict: "ALLOW_FOR_PREVIEW", reasonCode: "OK", bucket: "allowed", cardCall: false });
  });
});
