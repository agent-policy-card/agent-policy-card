// Login signatures whose domain has no verifyingContract (found on the bot on 2026-11-20).
import { describe, expect, it } from "vitest";
import { evaluate, toIntent } from "../src/evaluate.js";
import { canonicalize, parsePolicy } from "../src/schema.js";
import { CARD, TOKEN, chainWith, signArgs, signPreview, withPolicy } from "./fixtures.js";

const loginTd = (domain: Record<string, unknown>, primaryType = "Login") => ({ domain, primaryType, types: {}, message: { nonce: "abc", issuedAt: "2026-11-20" } });
const SOLVD = { name: "SOLVDLogin", version: "1", chainId: 56 };
const policy = withPolicy((p) => {
  p.rules.eip712.allow = [{ chainId: 56, domainName: "SOLVDLogin", primaryType: "Login" }];
});
const run = (td: object) => evaluate(toIntent("sign-message preview", signArgs(td), signPreview()), chainWith(policy), CARD);

describe("allowlist entries without verifyingContract", () => {
  it("parse and round trip", () => {
    const r = parsePolicy(canonicalize(policy));
    expect(r.ok).toBe(true);
    expect(canonicalize(policy)).not.toContain("verifyingContract");
  });

  it("allow the matching login", () => {
    expect(run(loginTd(SOLVD)).verdict).toBe("ALLOW_FOR_PREVIEW");
  });

  it("block the same login when the domain carries a verifyingContract", () => {
    expect(run(loginTd({ ...SOLVD, verifyingContract: TOKEN })).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("block another name, another primaryType, or another chain", () => {
    expect(run(loginTd({ ...SOLVD, name: "Other" })).reasonCode).toBe("BLOCKED_EIP712");
    expect(run(loginTd(SOLVD, "Permit")).reasonCode).toBe("BLOCKED_EIP712");
    expect(run(loginTd({ ...SOLVD, chainId: 1 })).reasonCode).toBe("BLOCKED_EIP712");
  });

  it("an entry with a verifyingContract does not match a domain without one", () => {
    const p = withPolicy((x) => {
      x.rules.eip712.allow = [{ chainId: 56, domainName: "SOLVDLogin", verifyingContract: TOKEN, primaryType: "Login" }];
    });
    expect(evaluate(toIntent("sign-message preview", signArgs(loginTd(SOLVD)), signPreview()), chainWith(p), CARD).reasonCode).toBe("BLOCKED_EIP712");
  });
});
