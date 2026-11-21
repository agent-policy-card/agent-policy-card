import { CARD_CONTRACT, parsePolicy } from "@apc/policy-core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuditVerifier } from "../components/AuditVerifier";
import { publicClient } from "../lib/chain";
import { shortAddress } from "../lib/facts";
import { readCard, type CardData } from "../lib/readCard";
import { Carton, CopyIcon } from "../world/Carton";
import { PanelHeader, RulesAndLimits, Section, TryAnAttack, Warnings } from "../world/Facts";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; card: CardData; block: bigint | null };

function fmtDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function CardView() {
  const { address = "" } = useParams<{ address: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([readCard(address, publicClient, CARD_CONTRACT), publicClient.getBlockNumber().catch(() => null)]).then(([r, block]) => {
      if (cancelled) return;
      setState("error" in r ? { kind: "error", message: r.error } : { kind: "ready", card: r, block });
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
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const paused = state.kind === "ready" && state.card.status === "PAUSED";

  return (
    <Carton paused={paused}>
      <div className="lede">
        <h1>{paused ? "This agent is paused." : "An agent's public rules."}</h1>
        <p>
          Read straight from the card contract on BNB Smart Chain. The owner declared these rules; the guard on the agent's machine
          enforces them.
        </p>
      </div>

      <div className="carton-columns">
        <article className="panel" aria-live="polite">
          {paused && <div className="tamper">Paused · every guarded action is blocked</div>}
          <PanelHeader status={state.kind === "ready" ? state.card.status : undefined}>
            <span className="mono">{shortAddress(address)}</span>
            {state.kind === "ready" && state.card.status !== "NONE" && <span>Version {state.card.version}</span>}
          </PanelHeader>

          {state.kind === "loading" && <p>Reading the card from the chain…</p>}
          {state.kind === "error" && (
            <p className="alert">{state.message === "Not a 0x address" ? "That is not a full 0x address." : "Could not read the card from the chain. Try again in a moment."}</p>
          )}
          {state.kind === "ready" && <CardFacts card={state.card} block={state.block} />}
        </article>

        <aside className="carton-side">
          <section>
            <h2>Share this card</h2>
            <p>Post the link so others can check what this agent refuses.</p>
            <button type="button" className="sticker" onClick={copyShare}>
              <CopyIcon />
              {copied ? "Copied" : "Copy share text"}
            </button>
          </section>
          <section>
            <h2>Publish your own</h2>
            <p>Takes about a minute and one prompt to your agent.</p>
            <p>
              <Link to="/">Compose a card</Link>
            </p>
          </section>
        </aside>
      </div>
    </Carton>
  );
}

function CardFacts({ card, block }: { card: CardData; block: bigint | null }) {
  if (card.status === "NONE") {
    return (
      <Section head="No card yet">
        <p>This address has not published a policy card.</p>
        <p>
          <Link to="/">Publish one</Link>
        </p>
      </Section>
    );
  }
  const parsed = parsePolicy(card.policyText);
  const ticket =
    block !== null ? (
      <a className="ticket" href={`https://bscscan.com/block/${block}`} target="_blank" rel="noreferrer">
        read at block {block.toString()}
      </a>
    ) : undefined;
  return (
    <>
      {parsed.ok ? (
        <RulesAndLimits policy={parsed.policy} ticket={ticket} />
      ) : (
        <Section head="Rules">
          <p className="alert">The published policy text cannot be read. The guard blocks everything until it is fixed.</p>
        </Section>
      )}

      <Section head="Record" note={`updated ${fmtDate(card.updatedAt)}`}>
        {card.attestation ? (
          <dl className="record">
            <div>
              <dt>Allowed to preview</dt>
              <dd>{card.attestation.allowedCount}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{card.attestation.totalBlocked}</dd>
            </div>
            <div className="wide">
              <dt>
                Attestation {card.attestation.epoch}, {fmtDate(card.attestation.periodStart)} to {fmtDate(card.attestation.periodEnd)}
              </dt>
              <dd>Merkle root {card.attestation.logMerkleRoot}</dd>
            </div>
          </dl>
        ) : (
          <p>No attestation yet. The owner has not anchored an audit log.</p>
        )}
        <ul className="rows limits">
          <li>
            <span>Guardian</span>
            <strong className="mono">{card.guardian ? shortAddress(card.guardian) : "None"}</strong>
          </li>
        </ul>
      </Section>

      <TryAnAttack policyText={card.policyText} paused={card.status === "PAUSED"} />
      <Warnings />
      <AuditVerifier root={card.attestation?.logMerkleRoot ?? null} />

      <p className="panel-foot">
        Source:{" "}
        <a className="ticket" href={`https://bscscan.com/address/${CARD_CONTRACT}#readContract`} target="_blank" rel="noreferrer">
          card contract {shortAddress(CARD_CONTRACT)}
        </a>
      </p>
    </>
  );
}
