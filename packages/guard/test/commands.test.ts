import { describe, expect, it } from "vitest";
import { classify } from "../src/commands.js";

describe("classify", () => {
  it("classifies preview and execute pairs", () => {
    const p = classify(["contract-call", "preview", "--binanceChainId", "56", "--to", "0xabc", "--json"]);
    expect(p).toEqual({ cls: "preview", command: "contract-call preview", args: { binanceChainId: "56", to: "0xabc", json: "true" } });
    expect(classify(["sign-message", "execute", "--requestId", "r1"]).cls).toBe("execute");
    expect(classify(["sign-message", "preview", "--message", "{}"]).cls).toBe("preview");
  });

  it("classifies one-step writes, including three-word commands", () => {
    expect(classify(["wallet", "send", "--amount", "1"]).cls).toBe("write-1step");
    expect(classify(["prediction", "trade", "place-order"]).command).toBe("prediction trade place-order");
    expect(classify(["x402-payment", "sign"]).cls).toBe("write-1step");
  });

  it("classifies reads and risk-reducing commands as passthrough reads", () => {
    for (const c of [["wallet", "balance"], ["approvals", "list"], ["prediction", "market", "order-book"], ["approvals", "revoke"], ["limit-order", "cancel"]]) {
      expect(classify(c).cls).toBe("read");
    }
  });

  it("treats anything else as unknown", () => {
    expect(classify(["wallet", "tx-lock"]).cls).toBe("unknown");
    expect(classify(["wallet", "balance", "extra"]).cls).toBe("unknown");
    expect(classify([]).cls).toBe("unknown");
    expect(classify(["--json"]).cls).toBe("unknown");
    expect(classify(["contract-call", "preview", "--to"]).args).toEqual({ to: "true" });
  });

  it("treats a repeated flag as unknown, so the guard and the wallet cannot read different values", () => {
    expect(classify(["contract-call", "preview", "--to", "0x1", "--to", "0x2"]).cls).toBe("unknown");
    expect(classify(["contract-call", "preview", "--to=0x1"]).cls).toBe("unknown");
  });
});
