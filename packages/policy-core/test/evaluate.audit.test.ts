// Regression tests for findings of the independent guard audit (guard-audit-1).
import { describe, expect, it } from "vitest";
import { evaluate, toIntent, type ChainState, type Intent } from "../src/evaluate.js";
import { PRESETS } from "../src/presets.js";
import { CARD, PERMIT_TD, SPENDER, TOKEN, WALLET, calldata, chainWith, contractArgs, contractPreview, signArgs, signPreview, typedData, withPolicy } from "./fixtures.js";

const run = (i: Intent, c: ChainState = chainWith()) => evaluate(i, c, CARD);
const denylist = withPolicy((p) => {
  p.rules.eip712 = { allow: [], deny: ["Permit"], mode: "denylist" };
});

describe("audit fixes in evaluate", () => {
  it("one-step commands need --binanceChainId 56", () => {
    expect(run(toIntent("wallet send", { amount: "1" }, null)).reasonCode).toBe("UNSUPPORTED_CHAIN");
    expect(run(toIntent("wallet send", { amount: "1", binanceChainId: "56" }, null)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("wallet speed-up is a one-step command", () => {
    expect(toIntent("wallet speed-up", { binanceChainId: "56" }, null).kind).toBe("oneStep");
  });

  it("contract previews need parsedTx and a successful simulation", () => {
    const noTx = contractPreview() as { data: Record<string, unknown> };
    delete noTx.data.parsedTx;
    expect(run(toIntent("contract-call preview", contractArgs(TOKEN, calldata.transfer()), noTx)).reasonCode).toBe("MALFORMED_PREVIEW");
    const failed = contractPreview() as { data: { simulationResult: Record<string, unknown> } };
    failed.data.simulationResult.simulationCode = "351805";
    expect(run(toIntent("contract-call preview", contractArgs(TOKEN, calldata.transfer()), failed)).reasonCode).toBe("MALFORMED_PREVIEW");
  });

  it("malformed or unknown risk items block", () => {
    for (const item of ["x", { riskType: "WEIRD" }, {}]) {
      const p = contractPreview() as { data: { risks: { riskDetails: unknown[] } } };
      p.data.risks.riskDetails = [item];
      expect(run(toIntent("contract-call preview", contractArgs(TOKEN, calldata.transfer()), p)).reasonCode).toBe("MALFORMED_PREVIEW");
    }
  });

  it("typed data must carry domain chainId 56 in every mode, and sign-message needs --binanceChainId 56", () => {
    const noChain = typedData({ name: "Mail", verifyingContract: TOKEN, primaryType: "Mail" });
    expect(run(toIntent("sign-message preview", signArgs(noChain), signPreview()), chainWith(denylist)).reasonCode).toBe("BLOCKED_EIP712");
    const args = signArgs(typedData({ name: "Mail", chainId: 56, verifyingContract: TOKEN, primaryType: "Mail" }));
    delete args.binanceChainId;
    expect(run(toIntent("sign-message preview", args, signPreview()), chainWith(denylist)).reasonCode).toBe("UNSUPPORTED_CHAIN");
  });

  it("typed data intents expose the signer from params[0] and reject a missing one", () => {
    const i = toIntent("sign-message preview", signArgs(PERMIT_TD), signPreview());
    expect(i.kind === "typedData" && i.signer).toBe(WALLET.toLowerCase());
    const bad = { binanceChainId: "56", signType: "EIP712", message: JSON.stringify({ method: "eth_signTypedData_v4", params: ["nope", JSON.stringify(PERMIT_TD)] }) };
    expect(toIntent("sign-message preview", bad, signPreview()).kind).toBe("malformed");
  });

  it("sign-message needs signType EIP712 and a SignTypedData parsed message", () => {
    const args = { ...signArgs(PERMIT_TD), signType: "PERSONAL_SIGN" };
    expect(toIntent("sign-message preview", args, signPreview()).kind).toBe("malformed");
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: [], mode: "denylist" };
    });
    const mail = typedData({ name: "Mail", chainId: 56, verifyingContract: TOKEN, primaryType: "Mail" });
    expect(run(toIntent("sign-message preview", signArgs(mail), signPreview({ messageType: "Other" })), chainWith(p)).reasonCode).toBe("MALFORMED_PREVIEW");
  });

  it("x402 typed data that grants authority is blocked even without a preview", () => {
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: [], mode: "denylist" };
      x.rules.oneStep.allow = ["x402-payment sign"];
    });
    const order = typedData({ name: "Pay", chainId: 56, verifyingContract: TOKEN, primaryType: "Order", message: { spender: SPENDER, amount: "5" } });
    expect(run(toIntent("x402-payment sign", signArgs(order), null), chainWith(p)).reasonCode).toBe("BLOCKED_APPROVE");
  });

  it("card calls must have value 0 and decodable calldata", () => {
    const i = toIntent("contract-call preview", contractArgs(CARD, calldata.pause(), "1"), contractPreview());
    expect(run(i)).toMatchObject({ verdict: "BLOCK", reasonCode: "BLOCKED_OTHER" });
    const garbage = toIntent("contract-call preview", contractArgs(CARD, calldata.pause().slice(0, 12)), contractPreview());
    expect(run(garbage).verdict).toBe("BLOCK");
  });

  it("the publishCard summary shows the new guardian and policy profile", () => {
    const d = run(toIntent("contract-call preview", contractArgs(CARD, calldata.publishCard()), contractPreview()), chainWith(PRESETS["eip712-shield"], { version: 2 }));
    expect(d.verdict).toBe("PENDING_HUMAN_CONFIRM");
    expect(d.summary).toContain(WALLET.toLowerCase());
    expect(d.summary).toContain("policy hash");
  });
});
