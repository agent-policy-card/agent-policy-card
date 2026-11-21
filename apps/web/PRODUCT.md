# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: people who already hold an Agent ID on BNB Chain and let an AI agent use their Binance Wallet Agentic Wallet through the `baw` CLI. They arrive from a post on X or a community chat, usually on a phone, and want their agent to stop signing things it should not (token Permits, unlimited approvals, transfer authorizations) without giving up their own confirmation step. Their job on the site: publish a policy card for their agent in about a minute by pasting one prompt to their agent.

Secondary: other visitors opening someone's card link (to see what rules that agent follows), a guardian the owner trusts (to pause the agent in an emergency), and hackathon judges evaluating the project.

## Product Purpose

Agent Policy Card lets the holder of an Agent ID publish, on chain, the rules their AI agent must follow, let a guardian pause the agent remotely, and anchor a Merkle root of the agent's audit log. Enforcement happens on the agent's machine through a local guard in front of the wallet CLI. Success: holders publish cards and run the guard; the project reaches at least 30 Agent ID holder addresses interacting with the card contract before 2026-12-09 15:00 (Vietnam time) for the Agent ID Hackathon Innovation award.

## Positioning

A card is bound to an Agent ID, which is one per person and non-transferable, so an agent's public rules and its record ("refused N actions since date Y") stay attached to an identity that cannot be swapped. The guard adds a personal rule layer on top of the wallet's own preview and risk checks instead of replacing them. A card is a verifiable self-declaration, never a certification.

## Operating Context

- Owners never connect the agent's wallet to the site. The site gives them a prompt with calldata; the agent runs `baw contract-call preview`, the owner reviews and says yes, the agent runs `execute`.
- Card pages open by `0x` address only. The site never resolves or displays `.ai` names next to addresses.
- The guardian connects their own ordinary wallet on the Guardian page to call `pause`.
- Static site, no backend, reads BSC through public RPC.

## Capabilities and Constraints

- Existing routes: Composer (`/`), public card (`/card/:address`) with a browser policy simulator and a Merkle audit verifier, Guardian (`/guardian`). A landing surface is to be added.
- Stack: Vite, React 18, TypeScript, viem, wagmi; shared logic in `@apc/policy-core` (presets, `describePolicy`, `evaluate`, Merkle).
- Card contract on BSC mainnet: `0xC86B1b2aeC451A1f59818bA34c9441BA929e719C`, source verified on BscScan.
- Presets: `eip712-shield` (default), `zero-spend`, `strict-allowlist`; cards can also carry custom rules (e.g. allowlisted login signatures).
- v1 blocks all x402 payments.
- UI copy is English only.
- Copy must not use "Binance" or "BNB" in product naming; the one native-value sentence from `describePolicy` uses the BNB ticker as a unit.

## Brand Commitments

- Name: Agent Policy Card.
- Voice: plain and honest, like Leash (the earlier project it builds on). Never "certified safe", never profit or airdrop language.

## Evidence on Hand

- One live card (version 2) with one attestation (epoch 1: 3 allowed, 6 blocked) published by the team's own bot wallet; real data readable on chain.
- Simulator runs the same `evaluate()` as the guard on four sample attacks.
- No testimonials, user counts, or press yet. Do not fabricate any.

## Product Principles

1. The owner always confirms; nothing on the site or in the guard bypasses the wallet's own confirmation.
2. Show, do not claim: every statement about a card is backed by chain data the visitor can check.
3. One minute to publish: the path from landing to a copied prompt must be short and obvious on a phone.
4. Honest limits are part of the product: say what the guard does not stop.
5. Never a name lookup: addresses only.

## Accessibility & Inclusion

Visitors are often on mobile from social links; the site must work at phone width and in both light and dark color schemes. No product-specific standard beyond solid WCAG AA practice.
