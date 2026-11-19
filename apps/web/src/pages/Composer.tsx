import { CARD_CONTRACT, PRESETS, describePolicy } from "@apc/policy-core";
import type { PolicyV1 } from "@apc/policy-core";
import { useMemo, useState } from "react";
import { buildAgentPrompt, buildPublishCalldata } from "../lib/calldata";

type PresetKey = keyof typeof PRESETS;

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
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid input" };
    }
  }, [policy, guardianText]);

  async function copy() {
    if (!result.ok || notDeployed) return;
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <h1>Compose your policy card</h1>
      <p>A card is a public self-declaration of the rules you want your agent to follow. It is not a certification.</p>

      <h2>Before you start</h2>
      <p>Have your agent run these two commands first:</p>
      <pre>baw wallet agent-id --json</pre>
      <p>This must show that an Agent ID is claimed.</p>
      <pre>baw wallet settings --json</pre>
      <p>
        Developer Mode must be on. It is enabled in the wallet app, lasts 7 days, and is extended by each successful
        use.
      </p>

      <h2>Choose a preset</h2>
      <div role="radiogroup" aria-label="Preset">
        {PRESET_KEYS.map((key) => (
          <div key={key}>
            <label>
              <input
                type="radio"
                name="preset"
                value={key}
                checked={preset === key}
                onChange={() => {
                  setPreset(key);
                  setCopied(false);
                }}
              />{" "}
              {key}
            </label>
            {preset === key && (
              <ul>
                {describePolicy(policy).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {preset === "strict-allowlist" && (
        <p>
          <label>
            Allowed contract addresses, one per line
            <br />
            <textarea
              rows={5}
              value={allowedText}
              onChange={(e) => setAllowedText(e.target.value)}
              placeholder="0x1111111111111111111111111111111111111111"
            />
          </label>
        </p>
      )}

      <h2>Guardian (optional)</h2>
      <p>
        <label>
          Guardian address
          <br />
          <input
            type="text"
            value={guardianText}
            onChange={(e) => setGuardianText(e.target.value)}
            placeholder="0x1111111111111111111111111111111111111111"
          />
        </label>
      </p>
      <p>A guardian can only pause, never unpause or change rules. Leave empty for none.</p>

      <h2>Prompt for your agent</h2>
      {notDeployed && <p role="alert">The card contract is not deployed yet</p>}
      {result.ok ? (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{result.prompt}</pre>
      ) : (
        <p role="alert">{result.error}</p>
      )}
      <button type="button" onClick={copy} disabled={notDeployed || !result.ok}>
        Copy prompt for agent
      </button>
      {copied && <span> Copied</span>}

      <footer>
        <p>Your agent signs with your own wallet CLI. This site never sees your keys or your address.</p>
      </footer>
    </section>
  );
}
