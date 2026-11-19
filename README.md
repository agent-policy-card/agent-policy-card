# Agent Policy Card

A public, self-declared rule card for AI agents whose wallet holds an Agent ID on BNB Chain.

The wallet owner publishes the rules their agent must follow. A guard on the agent's machine checks every wallet command against those rules before the wallet CLI runs it. A guardian the owner chooses can pause the agent remotely, and the owner can anchor a Merkle root of the guard's audit log on chain so anyone can check a single logged decision.

**A card is a verifiable self-declaration, not a compliance certificate.** The contract cannot know whether an agent actually runs the guard.

## Why Agent ID

Each person can claim one Agent ID, and it cannot be transferred. A card is bound to the address that holds it, so "this agent has followed rule set X since date Y and refused Z actions" stays attached to an identity that cannot be bought or swapped. Without Agent ID, an owner could simply move to a fresh wallet and leave a bad record behind.

## How it works

```text
Web composer (static, no backend, never connects the agent's wallet)
   -> prompt with calldata, pasted to the agent
Agent + wallet CLI: contract-call preview -> the user reviews and confirms -> execute
   -> AgentPolicyCard on BNB Chain (writes gated on AgentID.balanceOf(msg.sender) > 0)
Guard on the agent's machine (apc-baw)
   reads the policy text and pause flag from chain
   runs the real wallet CLI itself, evaluates the preview, binds the verdict to the requestId
   execute is allowed only for a requestId the guard approved, not expired, while not paused
Guardian page: the guardian's own ordinary wallet calls pause(owner)
```

What the default rules block:

- every EIP-712 signature except pairs (chain id, domain name, verifying contract, primary type) the owner allowlisted, so token Permit, Permit2 and transfer-authorization signatures are blocked by default
- unlimited token approvals and `setApprovalForAll(true)`, and any preview that reports allowance or authority changes
- calls the wallet's own preview flags as risky
- native value above the card's limit, denied selectors, targets outside an allowlist when one is set
- one-step write commands not listed on the card, and every unknown command
- any chain other than BNB Smart Chain (56)

Changes to the card itself (unpause, new guardian, new rules) need the owner to retype a random code with `apc-confirm` in a real terminal.

## Contract

- `contracts/src/AgentPolicyCard.sol`, Solidity 0.8.24, Foundry.
- Agent ID contract: `0x60b9262456de011f7d15a54cdd8c48baaa8b022f` (BSC mainnet), set as an immutable at deployment.
- Card contract address and BscScan link: added after deployment.
- Gas: publishing the default preset (362 bytes of policy text) for the first time costs about 361k gas, measured with `forge test --match-contract GasTest -vv`. The full text is stored on chain so the guard and the site read it without any other service.

### Owner permissions: none

No owner, no admin, no proxy, not payable, never holds or moves tokens. Each card can only be changed by the address that published it. A guardian can only pause, never unpause or edit.

## Install the guard

```bash
npm ci
npm run build -w @apc/guard
packages/guard/scripts/install.sh "$(command -v baw)" <your-agent-wallet-address> <card-contract-address>
```

The installer writes `~/.agent-policy-card/config.json`, copies `apc-baw`, `apc-confirm` and `apc-attest` to `~/.agent-policy-card/bin`, and links `baw` there so that directory placed first on the agent's `PATH` puts the guard in front of the real CLI. For Claude Code, register `packages/guard/dist/apc-hook.mjs` as a `PreToolUse` hook on `Bash`, and give the agent `packages/guard/SKILL.md`.

## Threat model and limits

The guard is built for an honest agent that gets tricked (prompt injection from a web page, a skill or a message). It is not built to stop an agent whose shell has been taken over.

- An agent running shell commands as the same user can call the real `baw` by absolute path, drive `apc-confirm` through a pseudo-terminal, or read the HMAC key and forge the state file. The HMAC only catches accidental or clumsy edits.
- The Claude Code hook recognises quoting tricks such as `'b'aw` but not commands assembled from shell variables.
- A preview already waiting for approval in the wallet app can still complete after a pause. Pause only stops what goes through the guard from then on.
- The hard stop is in the wallet app: turn off Developer Mode, lower the daily limit or end the session.
- Amount limits for one-step commands (send, swap) are left to the wallet app's daily limit in v1.

## Builds on Leash

This project reuses the architecture of Leash, from the Binance Agent OS hackathon: a pure decision core behind thin adapters, fail-closed handling on every error path, an HMAC-signed state file, a JSONL audit log and a PreToolUse hook. It does not reuse Leash's trading rules.

## Development

```bash
npm ci
npm run typecheck && npm test && npm run hygiene
cd contracts && forge test --no-match-path "*fork*"
npm run dev -w @apc/web
npm run count-holders
```

`npm run hygiene` fails when a tracked file contains a wallet address that is not listed in `hygiene.allow.json`, or a string listed in your untracked `.hygiene-local`.

## Red lines

| Rule | How this project handles it |
| --- | --- |
| No QR or pairing login for agent wallets | The site is static and never connects the agent's wallet. Every agent transaction goes through the owner's own wallet CLI. |
| Skills must not bypass confirmation | The guard only ever answers "allow to preview" or "block". SKILL.md has no exception for skipping confirmation. |
| No unauthorized asset movement | The contract is not payable and never calls tokens. The product blocks unlimited approvals and transfer signatures. |
| Open source, owner permissions | Ownerless, source verified on BscScan, this README lists owner permissions: none. |
| No lookup of other people's wallets by name | The site never resolves or shows `.ai` names; cards open by `0x` address only. |
| No fake activity | No rewards for transactions; the holder counter is for tracking only. |
