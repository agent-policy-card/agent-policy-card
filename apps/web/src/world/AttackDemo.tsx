// First-viewport demonstration: sample attacks arrive at a card and the guard's own evaluate()
// stamps them. Static (all stamped) under reduced motion.
import { PRESETS, SAMPLE_CARD_CONTRACT, SAMPLE_INTENTS, canonicalize, evaluate } from "@apc/policy-core";
import { useEffect, useMemo, useState } from "react";

const CHAIN = { ok: true as const, card: { version: 1, paused: false, policyText: canonicalize(PRESETS["eip712-shield"]) } };

export function AttackDemo() {
  const results = useMemo(() => SAMPLE_INTENTS.map((s) => ({ label: s.label, d: evaluate(s.intent, CHAIN, SAMPLE_CARD_CONTRACT) })), []);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(reduce ? results.length * 2 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % (results.length * 2 + 2)), 1300);
    return () => window.clearInterval(id);
  }, [reduce, results.length]);

  return (
    <figure className="demo" aria-label="A card blocking sample attacks">
      <figcaption>
        <span>Incoming to an agent with the default card</span>
      </figcaption>
      <ul>
        {results.map((r, i) => {
          const arrived = step > i * 2;
          const stamped = step > i * 2 + 1;
          return (
            <li key={r.label} className={arrived ? "demo-row demo-row--in" : "demo-row"}>
              <span>{r.label}</span>
              {stamped && (
                <span className={r.d.verdict === "BLOCK" ? "stamp stamp--block" : "stamp stamp--allow"}>
                  {r.d.verdict === "BLOCK" ? "BLOCKED" : "ALLOWED"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
