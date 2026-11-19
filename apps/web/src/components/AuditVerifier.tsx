import { useEffect, useState } from "react";
import { verifyAuditLine } from "./verify";

const BOX = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

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
    <div style={BOX}>
      <h2>Audit verifier</h2>
      {disabled && <p style={{ color: "var(--muted)" }}>No attestation yet</p>}
      <p>
        <label>
          Audit proof JSON
          <br />
          <textarea
            rows={4}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResult(null);
            }}
            disabled={disabled}
            placeholder='Paste JSON from "apc-attest proof"'
            style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </label>
      </p>
      <p>
        <button type="button" onClick={onVerify} disabled={disabled}>
          Verify
        </button>
      </p>
      {result !== null && (
        <p role={result.ok ? "status" : "alert"} style={{ color: result.ok ? "var(--accent)" : "var(--danger)" }}>
          {result.ok ? "Verified against the on-chain root" : result.error}
        </p>
      )}
    </div>
  );
}
