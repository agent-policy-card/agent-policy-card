import { SAMPLE_CARD_CONTRACT, SAMPLE_INTENTS, evaluate, type Decision, type PolicyV1 } from "@apc/policy-core";
import { useState, type ReactNode } from "react";
import { toFacts } from "../lib/facts";

export type CardStatus = "ACTIVE" | "PAUSED" | "NONE" | "DRAFT";

const STATUS_CLASS: Record<CardStatus, string> = {
  ACTIVE: "status status--active",
  PAUSED: "status status--paused",
  NONE: "status status--none",
  DRAFT: "status status--none",
};

export function PanelHeader({ title = "Policy Facts", status, children }: { title?: string; status?: CardStatus; children?: ReactNode }) {
  return (
    <>
      <h2 className="panel-title">{title}</h2>
      <div className="panel-sub">
        {status && <span className={STATUS_CLASS[status]}>{status === "NONE" ? "NO CARD" : status}</span>}
        {children}
      </div>
      <hr className="rule-thick" />
    </>
  );
}

export function Section({ head, note, children }: { head: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="facts-section">
      <h3 className="section-head">
        {head}
        {note && <small>{note}</small>}
      </h3>
      {children}
    </section>
  );
}

export function RulesAndLimits({ policy, ticket }: { policy: PolicyV1; ticket?: ReactNode }) {
  const facts = toFacts(policy);
  return (
    <>
      <Section head="Rules" note={ticket}>
        <ol className="rows rows--print">
          {facts.rules.map((r, i) => (
            <li key={r.number} style={{ ["--i" as string]: i }}>
              <span className="rule-num">Rule {r.number}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section head="Limits">
        <ul className="rows limits">
          {facts.limits.map((l) => (
            <li key={l.label}>
              <span>{l.label}</span>
              <strong>{l.value}</strong>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

export function Warnings() {
  return (
    <Section head="Warnings">
      <ul className="rows warnings">
        <li>The guard stops an agent that was tricked. It does not stop an agent that deliberately runs the wallet directly.</li>
        <li>
          Pausing stops agents that run the guard. The hard stop is in the wallet app: turn off Developer Mode, lower the daily limit
          or end the session.
        </li>
        <li>Send and swap amounts are left to the wallet app's daily limit.</li>
        <li>x402 payments are always blocked in this version.</li>
        <li>A card is the owner's own declaration, not a certification.</li>
      </ul>
    </Section>
  );
}

export function TryAnAttack({ policyText, paused }: { policyText: string; paused: boolean }) {
  const [tried, setTried] = useState<Record<string, Decision>>({});
  const chain = { ok: true as const, card: { version: 1, paused, policyText } };

  function tryOne(id: string) {
    const sample = SAMPLE_INTENTS.find((s) => s.id === id);
    if (!sample) return;
    setTried((t) => ({ ...t, [id]: evaluate(sample.intent, chain, SAMPLE_CARD_CONTRACT) }));
  }

  return (
    <Section head="Try an attack" note="runs the guard's own rules in your browser, sends nothing">
      <ul className="rows attacks">
        {SAMPLE_INTENTS.map((s) => {
          const d = tried[s.id];
          return (
            <li key={s.id}>
              <span>{s.label}</span>
              {d ? (
                <span className={d.verdict === "BLOCK" ? "stamp stamp--block" : "stamp stamp--allow"} role="status">
                  {d.verdict === "BLOCK" ? "BLOCKED" : "ALLOWED"}
                  <small>{d.reasonCode}</small>
                </span>
              ) : (
                <button type="button" className="attack-try" onClick={() => tryOne(s.id)}>
                  Try it
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
