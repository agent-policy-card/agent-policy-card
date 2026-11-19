import { CARD_CONTRACT } from "@apc/policy-core";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicClient } from "../lib/chain";
import { readCard, type CardData } from "../lib/readCard";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; card: CardData };

const BADGE: Record<CardData["status"], { label: string; color: string }> = {
  ACTIVE: { label: "ACTIVE", color: "var(--accent)" },
  PAUSED: { label: "PAUSED", color: "var(--danger)" },
  NONE: { label: "NO CARD", color: "var(--muted)" },
};

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function CardView() {
  const { address = "" } = useParams<{ address: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    readCard(address, publicClient, CARD_CONTRACT).then((r) => {
      if (cancelled) return;
      setState("error" in r ? { kind: "error", message: r.error } : { kind: "ready", card: r });
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function copyShare() {
    const text = `My AI agent now runs under a public policy card on BNB Chain. Rules, pause status and audit root: ${window.location.href}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article>
      <h1>Policy card</h1>
      <p style={{ color: "var(--muted)" }}>
        This card is a public self-declaration by the wallet owner. It is not a certification.
      </p>
      <p>
        <code>{address}</code>
      </p>

      {state.kind === "loading" && <p>Loading card...</p>}
      {state.kind === "error" && <p style={{ color: "var(--danger)" }}>{state.message}</p>}
      {state.kind === "ready" && <CardBody card={state.card} />}

      <p>
        <button type="button" onClick={copyShare}>
          {copied ? "Copied" : "Copy share text"}
        </button>
      </p>

      <section id="simulator"></section>
      <section id="audit-verifier"></section>
    </article>
  );
}

function CardBody({ card }: { card: CardData }) {
  const badge = BADGE[card.status];
  const box = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12 };
  return (
    <>
      <p>
        <strong style={{ color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 6, padding: "2px 8px" }}>
          {badge.label}
        </strong>
      </p>
      {card.status === "NONE" ? (
        <p>This address has not published a policy card.</p>
      ) : (
        <>
          <div style={box}>
            <p>Version: {card.version}</p>
            <p>Last updated: {fmtDate(card.updatedAt)}</p>
          </div>
          <div style={box}>
            <h2>Rules</h2>
            <ul>
              {card.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
          <div style={box}>
            <h2>Guardian</h2>
            {card.guardian ? <code>{card.guardian}</code> : <p>No guardian</p>}
          </div>
          <div style={box}>
            <h2>Latest attestation</h2>
            {card.attestation ? (
              <>
                <p>Epoch: {card.attestation.epoch}</p>
                <p>Allowed: {card.attestation.allowedCount}</p>
                <p>Blocked: {card.attestation.totalBlocked}</p>
                <p>
                  Period: {fmtDate(card.attestation.periodStart)} to {fmtDate(card.attestation.periodEnd)}
                </p>
                <p>
                  Merkle root: <code style={{ wordBreak: "break-all" }}>{card.attestation.logMerkleRoot}</code>
                </p>
              </>
            ) : (
              <p>No attestation yet</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
