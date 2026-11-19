# Agent Policy Card

A public, self-declared rule card for AI agents that hold an Agent ID on BNB Chain. The owner publishes the rules their agent must follow, can let a guardian pause the agent remotely, and anchors a Merkle root of the local audit log on chain. Enforcement happens on the machine that runs the agent, through a guard that sits in front of the Binance Wallet `baw` CLI.

A card is a verifiable self-declaration, not a compliance certificate. The contract cannot know whether an agent actually runs the guard.

## Owner permissions: none

The contract has no owner, no admin, no proxy, is not payable and never touches tokens.

## Builds on Leash

This project reuses the architecture of Leash (a pure decision core behind thin adapters, fail-closed handling, an HMAC-signed state file, a JSONL audit log and a PreToolUse hook), not its trading rules.

## Development

```bash
npm ci
npm run typecheck && npm test && npm run hygiene
cd contracts && forge test --no-match-path "*fork*"
```

`npm run hygiene` fails when a tracked file contains a wallet address that is not listed in `hygiene.allow.json`, or a string listed in your untracked `.hygiene-local`.
