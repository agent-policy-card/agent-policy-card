import { CARD_CONTRACT, CARD_ABI } from "@apc/policy-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { publicClient } from "../lib/chain";
import { buildPauseCalldata, guardianState, type GuardianState } from "../lib/guardian";
import { readCard, type CardData } from "../lib/readCard";
import { wagmiConfig } from "../lib/wagmi";
import { Carton } from "../world/Carton";
import { PanelHeader, Section } from "../world/Facts";

const ZERO = "0x0000000000000000000000000000000000000000";

function message(s: GuardianState): string {
  switch (s.kind) {
    case "invalid-agent":
      return "Enter a valid 0x agent address.";
    case "no-card":
      return "This address has not published a policy card.";
    case "no-guardian":
      return "This card has no guardian, so no one can pause it from here.";
    case "not-guardian":
      return `The connected wallet is not this card's guardian. Guardian: ${s.guardian}`;
    case "already-paused":
      return "This card is already paused.";
    case "can-pause":
      return "You are the guardian of this card. You can pause it.";
  }
}

export function Guardian() {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <GuardianInner />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function GuardianInner() {
  const [params] = useSearchParams();
  const [agent, setAgent] = useState(params.get("agent") ?? "");
  const [card, setCard] = useState<CardData | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const { address } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();

  const deployed = CARD_CONTRACT.toLowerCase() !== ZERO;
  const trimmed = agent.trim();

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setReadError(null);
    if (!deployed || !/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return;
    readCard(trimmed, publicClient, CARD_CONTRACT).then((r) => {
      if (cancelled) return;
      if ("error" in r) setReadError(r.error);
      else setCard(r);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed, deployed]);

  const state = useMemo(
    () =>
      guardianState(
        trimmed,
        card ? { version: card.version, paused: card.status === "PAUSED", guardian: card.guardian } : null,
        address ?? null,
      ),
    [trimmed, card, address],
  );

  const canPause = deployed && state.kind === "can-pause" && !isPending && !txHash;

  function pause() {
    if (!canPause) return;
    try {
      buildPauseCalldata(trimmed);
    } catch {
      return;
    }
    writeContract({
      address: CARD_CONTRACT as `0x${string}`,
      abi: CARD_ABI,
      functionName: "pause",
      args: [trimmed as `0x${string}`],
      chainId: 56,
    });
  }

  return (
    <Carton paused={state.kind === "already-paused" || Boolean(txHash)}>
      <div className="lede">
        <h1>Pause an agent.</h1>
        <p>For the guardian named on a card. Connect your own ordinary wallet, never the agent's, and stop the agent's next guarded action.</p>
      </div>

      <div className="carton-columns">
        <article className="panel">
          {txHash && <div className="tamper">Paused · every guarded action is blocked</div>}
          <PanelHeader title="Guardian Controls" />

          <Section head="Agent">
            <label className="field">
              Agent wallet address
              <input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="0x..." spellCheck={false} autoComplete="off" />
            </label>
            {!deployed && <p className="alert">The card contract is not deployed yet.</p>}
            {readError && <p className="alert">{readError === "Not a 0x address" ? "That is not a full 0x address." : "Could not read the card from the chain."}</p>}
            {deployed && !readError && <p>{trimmed === "" ? "Paste the agent wallet address shown on the card you guard." : message(state)}</p>}
          </Section>

          <Section head="Your wallet">
            {address ? (
              <ul className="rows limits">
                <li>
                  <span>Connected</span>
                  <strong className="mono">{address.slice(0, 6)}…{address.slice(-4)}</strong>
                </li>
                <li>
                  <span>Wrong wallet?</span>
                  <button type="button" className="attack-try" onClick={() => disconnect()}>
                    Disconnect
                  </button>
                </li>
              </ul>
            ) : (
              <button
                type="button"
                className="attack-try"
                disabled={connecting || connectors.length === 0}
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              >
                {connectors.length === 0 ? "No browser wallet found" : connecting ? "Connecting…" : "Connect guardian wallet"}
              </button>
            )}
            {connectError && <p className="alert">Could not connect the wallet. Open this page in a browser with your wallet extension.</p>}
          </Section>

          <Section head="Pause">
            <button type="button" className="sticker sticker--danger" disabled={!canPause} onClick={pause}>
              {isPending ? "Confirm in your wallet…" : "Emergency pause"}
            </button>
            {writeError && <p className="alert">The pause transaction was not sent.</p>}
            {txHash && (
              <p className="done" role="status">
                Paused.{" "}
                <a className="ticket" href={`https://bscscan.com/tx/${txHash}`} target="_blank" rel="noreferrer">
                  tx {txHash.slice(0, 10)}…
                </a>{" "}
                The agent's guard blocks its next actions.
              </p>
            )}
          </Section>

          <Section head="Warnings">
            <ul className="rows warnings">
              <li>Pausing only stops agents that run the Agent Policy Card guard.</li>
              <li>The hard stop is in the wallet app: turn off Developer Mode, lower the daily limit or end the session.</li>
              <li>You cannot unpause. Only the owner can, after deciding it is safe.</li>
            </ul>
          </Section>
        </article>

        <aside className="carton-side">
          <section>
            <h2>Not a guardian yet?</h2>
            <p>The owner adds you when they publish or update their card. Your wallet needs a little BNB for gas.</p>
            <p>
              <Link to="/">Compose a card</Link>
            </p>
          </section>
        </aside>
      </div>
    </Carton>
  );
}
