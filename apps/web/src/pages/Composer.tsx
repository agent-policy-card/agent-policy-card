import { CARD_CONTRACT, PRESETS, canonicalize } from "@apc/policy-core";
import type { PolicyV1 } from "@apc/policy-core";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { buildAgentPrompt, buildPublishCalldata } from "../lib/calldata";
import { shortAddress } from "../lib/facts";
import { isAddress0x } from "../lib/readCard";
import { Carton, CopyIcon } from "../world/Carton";
import { PanelHeader, RulesAndLimits, Section, TryAnAttack, Warnings } from "../world/Facts";

type PresetKey = keyof typeof PRESETS;

const PRESET_LABEL: Record<PresetKey, string> = {
  "eip712-shield": "Signature shield",
  "zero-spend": "Zero spend",
  "strict-allowlist": "Allowlist only",
};
const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
const ZERO = "0x0000000000000000000000000000000000000000";

export function Composer() {
  const [preset, setPreset] = useState<PresetKey>("eip712-shield");
  const [allowedText, setAllowedText] = useState("");
  const [guardianText, setGuardianText] = useState("");
  const [copied, setCopied] = useState(false);

  const notDeployed = CARD_CONTRACT.toLowerCase() === ZERO;

  const policy: PolicyV1 = useMemo(() => {
    const base = structuredClone(PRESETS[preset]);
    if (preset === "strict-allowlist") {
      base.rules.allowedContracts = allowedText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    }
    return base;
  }, [preset, allowedText]);

  const result = useMemo(() => {
    try {
      const guardian = guardianText.trim() === "" ? null : guardianText.trim();
      const calldata = buildPublishCalldata(policy, guardian);
      return { ok: true as const, prompt: buildAgentPrompt(CARD_CONTRACT, calldata) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Check the fields above." };
    }
  }, [policy, guardianText]);

  // HashRouter owns the URL hash, so scroll without touching it.
  function goToDirections() {
    const target = document.getElementById("directions");
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.querySelector<HTMLInputElement>('#directions input[name="preset"]:checked')?.focus({ preventScroll: true });
  }

  async function copy() {
    if (!result.ok || notDeployed) return;
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Carton>
      <div className="lede">
        <h1>Your agent's rules, printed on chain.</h1>
        <p>
          Publish a public policy card for the agent behind your Agent ID. A guard on the agent's machine checks every wallet
          command against it before anything is signed, and your own confirmation still comes last.
        </p>
        <p>
          <button type="button" className="sticker" onClick={goToDirections}>
            Publish yours in one minute
          </button>
        </p>
      </div>

      <div className="carton-columns">
        <article className="panel" aria-label="Policy Facts for the card you are composing">
          <PanelHeader status="DRAFT">
            <span>Your card, as it will be published</span>
          </PanelHeader>

          <RulesAndLimits policy={policy} />
          <TryAnAttack policyText={canonicalize(policy)} paused={false} />
          <Warnings />

          <section className="facts-section" id="directions">
            <h3 className="section-head">Directions</h3>
            <ol className="steps">
              <li>
                <div>
                  <p>Have your agent check it holds an Agent ID and that Developer Mode is on in the wallet app.</p>
                  <code className="cmd">baw wallet agent-id --json</code>
                  <code className="cmd">baw wallet settings --json</code>
                </div>
              </li>
              <li>
                <div>
                  <p>Choose the rules. The panel above follows your choice.</p>
                  <div className="segmented" role="radiogroup" aria-label="Rule set">
                    {PRESET_KEYS.map((key) => (
                      <label key={key}>
                        <input
                          type="radio"
                          name="preset"
                          value={key}
                          checked={preset === key}
                          onChange={() => {
                            setPreset(key);
                            setCopied(false);
                          }}
                        />
                        <span>{PRESET_LABEL[key]}</span>
                      </label>
                    ))}
                  </div>
                  {preset === "strict-allowlist" && (
                    <label className="field">
                      Contracts your agent may call, one 0x address per line
                      <textarea rows={4} value={allowedText} onChange={(e) => setAllowedText(e.target.value)} placeholder="0x..." />
                    </label>
                  )}
                  <label className="field">
                    Guardian address (optional)
                    <input type="text" value={guardianText} onChange={(e) => setGuardianText(e.target.value)} placeholder="0x..." />
                    <small>A guardian can pause your agent from their own wallet. They can never unpause it or change the rules.</small>
                  </label>
                </div>
              </li>
              <li>
                <div>
                  <p>Copy the prompt and paste it to your agent. It previews the transaction, shows you the details and waits for your yes.</p>
                  {notDeployed && <p className="alert">The card contract is not deployed yet.</p>}
                  {!result.ok && <p className="alert">{result.error}</p>}
                  <button type="button" className="sticker" onClick={copy} disabled={notDeployed || !result.ok}>
                    <CopyIcon />
                    {copied ? "Copied" : "Copy prompt for my agent"}
                  </button>
                  {copied && (
                    <p className="done" role="status">
                      Copied. Paste it to your agent.
                    </p>
                  )}
                  {result.ok && (
                    <details className="prompt-preview">
                      <summary>See the full prompt</summary>
                      <pre>{result.prompt}</pre>
                    </details>
                  )}
                </div>
              </li>
            </ol>
          </section>

          <p className="panel-foot">
            Card contract{" "}
            <a className="ticket" href={`https://bscscan.com/address/${CARD_CONTRACT}#code`} target="_blank" rel="noreferrer">
              {shortAddress(CARD_CONTRACT)} · verified source
            </a>{" "}
            on BNB Smart Chain. No owner, no admin. This site never sees your keys or your address.
          </p>
        </article>

        <aside className="carton-side">
          <OpenCard />
          <section>
            <h2>Why a card</h2>
            <p>
              Agents get talked into signing things: a token Permit on a web page, an unlimited approval, a transfer authorization.
              A card writes down what yours will refuse, where everyone can check it.
            </p>
            <p>
              It is bound to your Agent ID, one per person and not transferable, so the record of what your agent refused stays with
              you.
            </p>
          </section>
          <section>
            <h2>Have a guardian?</h2>
            <p>They can pause your agent from their own wallet in one click.</p>
            <p>
              <a href="#/guardian">Open the guardian page</a>
            </p>
          </section>
        </aside>
      </div>
    </Carton>
  );
}

function OpenCard() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const a = value.trim();
    if (!isAddress0x(a)) {
      setError("Enter a full 0x address (42 characters).");
      return;
    }
    navigate(`/card/${a}`);
  }

  return (
    <section>
      <h2>Read any card</h2>
      <p>Every card is public. Open one by its agent wallet address.</p>
      <form className="open-card" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="open-card-address">
          Agent wallet address
        </label>
        <input
          id="open-card-address"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x agent wallet address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <button type="submit">Open card</button>
      </form>
      {error && <p className="carton-error">{error}</p>}
    </section>
  );
}
