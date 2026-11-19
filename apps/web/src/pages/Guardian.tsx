import { CARD_CONTRACT, CARD_ABI } from "@apc/policy-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { publicClient } from "../lib/chain";
import { buildPauseCalldata, guardianState, type GuardianState } from "../lib/guardian";
import { readCard, type CardData } from "../lib/readCard";
import { wagmiConfig } from "../lib/wagmi";

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

  const box = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginBottom: 12 };

  return (
    <article>
      <h1>Guardian</h1>
      <p style={{ color: "var(--danger)" }}>
        Use your own ordinary wallet here. Never connect the agent's wallet to any website.
      </p>

      <div style={box}>
        <label>
          Agent address
          <br />
          <input
            style={{ width: "100%" }}
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="0x1111111111111111111111111111111111111111"
          />
        </label>
      </div>

      <div style={box}>
        {address ? (
          <p>
            Connected: <code>{address}</code>{" "}
            <button type="button" onClick={() => disconnect()}>
              Disconnect
            </button>
          </p>
        ) : (
          <button
            type="button"
            disabled={connecting || connectors.length === 0}
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
          >
            Connect guardian wallet
          </button>
        )}
        {connectError && <p style={{ color: "var(--danger)" }}>Could not connect the wallet.</p>}
      </div>

      {!deployed && <p style={{ color: "var(--danger)" }}>The card contract is not deployed yet.</p>}
      {readError && <p style={{ color: "var(--danger)" }}>{readError}</p>}
      {deployed && !readError && <p>{message(state)}</p>}

      <p>
        <button
          type="button"
          disabled={!canPause}
          onClick={pause}
          style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px" }}
        >
          {isPending ? "Confirm in your wallet..." : "Emergency pause"}
        </button>
      </p>
      {writeError && <p style={{ color: "var(--danger)" }}>The pause transaction was not sent.</p>}
      {txHash && (
        <div style={box}>
          <p>
            Transaction: <code style={{ wordBreak: "break-all" }}>{txHash}</code>
          </p>
          <p>Paused. The agent's guard will block its next actions.</p>
        </div>
      )}

      <p style={{ color: "var(--muted)" }}>
        Pausing only stops agents that run the Agent Policy Card guard. The hard stop is in the wallet app: turn off
        Developer Mode, lower the daily limit or end the session.
      </p>
    </article>
  );
}
