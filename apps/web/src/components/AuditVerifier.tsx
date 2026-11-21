import { useEffect, useState } from "react";
import { Section } from "../world/Facts";
import { verifyAuditLine } from "./verify";

export function AuditVerifier({ root }: { root: string | null }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    setResult(null);
  }, [root]);

  const disabled = root === null;

  function onVerify() {
    if (root === null) return;
    setResult(verifyAuditLine(input, root));
  }

  return (
    <Section head="Check a log line" note={disabled ? "needs an attestation" : "against the on-chain Merkle root"}>
      <label className="field">
        Proof from the owner (output of apc-attest proof)
        <textarea
          rows={3}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setResult(null);
          }}
          disabled={disabled}
          placeholder='{"line": "...", "proof": ["0x..."], "root": "0x..."}'
        />
      </label>
      <button type="button" className="attack-try" onClick={onVerify} disabled={disabled || input.trim() === ""}>
        Verify line
      </button>
      {result !== null && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "done" : "alert"}>
          {result.ok ? "This line is part of the attested log." : result.error}
        </p>
      )}
    </Section>
  );
}
