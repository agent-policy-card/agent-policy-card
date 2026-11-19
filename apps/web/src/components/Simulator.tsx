import { evaluate, type Verdict } from "@apc/policy-core";
import { SAMPLE_CARD_CONTRACT, SAMPLE_INTENTS } from "@apc/policy-core";

const VERDICT_COLOR: Record<Verdict, string> = {
  BLOCK: "var(--danger)",
  ALLOW_FOR_PREVIEW: "var(--accent)",
  PENDING_HUMAN_CONFIRM: "var(--muted)",
};

const BOX = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
};

export function Simulator({ policyText, paused }: { policyText: string; paused: boolean }) {
  const chain = { ok: true as const, card: { version: 1, paused, policyText } };

  return (
    <div style={BOX}>
      <h2>What this card would do</h2>
      <p style={{ color: "var(--muted)" }}>
        Runs the same rules as the agent's guard, in your browser. No transaction is sent.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {SAMPLE_INTENTS.map((sample) => {
          const decision = evaluate(sample.intent, chain, SAMPLE_CARD_CONTRACT);
          return (
            <li
              key={sample.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderTop: "1px solid var(--line)",
              }}
            >
              <span>{sample.label}</span>
              <span>
                <strong style={{ color: VERDICT_COLOR[decision.verdict] }}>{decision.verdict}</strong>{" "}
                <code>{decision.reasonCode}</code>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
