import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { logsClient, publicClient } from "../lib/chain";
import { shortAddress } from "../lib/facts";
import { FOUNDING_LIMIT, fetchWall, type Wall as WallData } from "../lib/wall";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; wall: WallData };

export function Wall() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchWall(publicClient, logsClient)
      .then((wall) => !cancelled && setState({ kind: "ready", wall }))
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = state.kind === "ready" ? state.wall.totals : null;
  const left = totals ? Math.max(0, FOUNDING_LIMIT - totals.cards) : null;

  return (
    <section className="wall" aria-labelledby="wall-title">
      <div className="wall-head">
        <h2 id="wall-title">The shelf</h2>
        <p>Every card published so far, read live from the chain. The first {FOUNDING_LIMIT} carry a founding number.</p>
      </div>

      <dl className="tally">
        <div>
          <dt>Cards printed</dt>
          <dd>{totals ? totals.cards : "…"}</dd>
        </div>
        <div>
          <dt>Actions blocked, attested on chain</dt>
          <dd>{totals ? totals.blocked : "…"}</dd>
        </div>
        <div>
          <dt>Founding numbers left</dt>
          <dd>{left ?? "…"}</dd>
        </div>
      </dl>

      {state.kind === "error" && <p className="carton-error">Could not read the shelf from the chain right now.</p>}
      {state.kind === "loading" && <p className="wall-note">Reading cards from the chain…</p>}
      {state.kind === "ready" && (
        <ol className="shelf">
          {state.wall.entries.map((e) => (
            <li key={e.owner}>
              <Link to={`/card/${e.owner}`} className={e.card?.paused ? "label label--paused" : "label"}>
                <span className="label-top">
                  <span className="label-no">{e.founding !== null ? `Founding #${String(e.founding).padStart(2, "0")}` : "Card"}</span>
                  <span className={e.card?.paused ? "status status--paused" : "status status--active"}>{e.card?.paused ? "PAUSED" : "ACTIVE"}</span>
                </span>
                <span className="label-addr mono">{shortAddress(e.owner)}</span>
                <span className="label-facts">
                  <span>
                    <strong>{e.card ? e.card.ruleCount : "?"}</strong> rules
                  </span>
                  <span>
                    <strong>{e.card?.totalBlocked ?? "?"}</strong> blocked
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {left !== null && left > 0 && (
            <li>
              <a href="#directions" className="label label--empty" onClick={(ev) => {
                ev.preventDefault();
                document.getElementById("directions")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>
                <span className="label-no">Founding #{String((totals?.cards ?? 0) + 1).padStart(2, "0")}</span>
                <span className="label-addr">This one could be yours.</span>
              </a>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
