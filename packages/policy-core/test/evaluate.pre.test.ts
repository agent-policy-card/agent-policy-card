// Pre-check: evaluate what the arguments alone reveal, before anything reaches the wallet CLI.
import { describe, expect, it } from "vitest";
import { evaluate, toIntent } from "../src/evaluate.js";
import { PRESETS } from "../src/presets.js";
import { CARD, CHAIN_DOWN, PERMIT_TD, TOKEN, calldata, chainWith, contractArgs, signArgs, typedData, withPolicy } from "./fixtures.js";

const pre = { stage: "pre" as const };

describe("evaluate stage pre (no preview yet)", () => {
  it("blocks an unlimited approve from calldata alone", () => {
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, calldata.approveMax()), null), chainWith(), CARD, pre).reasonCode).toBe("BLOCKED_APPROVE");
  });

  it("blocks a Permit signature from the typed data alone", () => {
    expect(evaluate(toIntent("sign-message preview", signArgs(PERMIT_TD), null), chainWith(), CARD, pre).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("blocks value above the card limit, pause and chain problems", () => {
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, "0x", "20000000000000000"), null), chainWith(), CARD, pre).reasonCode).toBe("BLOCKED_OTHER");
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, "0x"), null), chainWith(PRESETS["eip712-shield"], { paused: true }), CARD, pre).reasonCode).toBe("AGENT_PAUSED");
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, "0x"), null), CHAIN_DOWN, CARD, pre).reasonCode).toBe("CHAIN_READ_FAILED");
  });

  it("lets a clean call and an allowlisted typed data pass to the preview step", () => {
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, calldata.transfer()), null), chainWith(), CARD, pre).verdict).toBe("ALLOW_FOR_PREVIEW");
    const p = withPolicy((x) => {
      x.rules.eip712 = { allow: [], deny: [], mode: "denylist" };
    });
    const mail = typedData({ name: "Mail", chainId: 56, verifyingContract: TOKEN, primaryType: "Mail" });
    expect(evaluate(toIntent("sign-message preview", signArgs(mail), null), chainWith(p), CARD, pre).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("card calls are judged without a preview too", () => {
    expect(evaluate(toIntent("contract-call preview", contractArgs(CARD, calldata.unpause()), null), chainWith(), CARD, pre).verdict).toBe("PENDING_HUMAN_CONFIRM");
    expect(evaluate(toIntent("contract-call preview", contractArgs(CARD, calldata.pause()), null), chainWith(), CARD, pre).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("the default post stage still requires the preview", () => {
    expect(evaluate(toIntent("contract-call preview", contractArgs(TOKEN, calldata.transfer()), null), chainWith(), CARD).reasonCode).toBe("MALFORMED_PREVIEW");
  });
});
