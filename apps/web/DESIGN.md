---
name: Agent Policy Card
description: An agent's public rules printed like a regulated facts panel on a loud carton.
colors:
  carton: "#1546ff"
  carton-deep: "#0d33c9"
  carton-paused: "#2b3352"
  on-carton: "#ffffff"
  on-carton-soft: "#d6defe"
  panel: "#ffffff"
  ink: "#0b0b0c"
  ink-soft: "#3b3b42"
  sticker: "#ffd23f"
  tamper: "#cc2620"
  ok: "#0a7a3f"
  cmd-well: "#ececea"
typography:
  display:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(44px, 9vw, 96px)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "clamp(40px, 8vw, 58px)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 900
    letterSpacing: "0.005em"
    fontVariation: "'wdth' 75"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 75"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.86em"
    fontFeature: "'tnum'"
rounded:
  none: "0px"
spacing:
  row: "6px"
  step: "10px"
  gutter: "16px"
  panel: "18px"
  section: "36px"
  columns: "40px"
components:
  button-primary:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
    typography: "{typography.title}"
  button-danger:
    backgroundColor: "{colors.tamper}"
    textColor: "{colors.on-carton}"
    rounded: "{rounded.none}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  facts-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "18px 18px 22px"
  tamper-strip:
    backgroundColor: "{colors.tamper}"
    textColor: "{colors.on-carton}"
    padding: "8px 18px"
---

# Design System: Agent Policy Card

## Overview

**Creative North Star: "The Policy Facts Panel"**

Every agent's rules are printed like the regulated facts panel on an over-the-counter medicine carton. The page is the carton: one saturated electric cobalt field, edge to edge, with the product claim set huge and condensed on it. Centered on the carton sits a white Policy Facts panel, ruled in heavy and hairline black, carrying real chain data in a fixed order: Rules, Limits, Warnings, the attestation record, and Directions. The panel is never decorative; it is the content.

State owns the whole surface. A paused card does not get a small badge: the carton dims to slate and a red tamper strip crosses the top of the panel. The one action on any screen is a yellow highlight sticker. Origin tickets (dashed monospace stubs linking to a block, a tx, or the contract) sit beside the facts they prove, so every statement is checkable. The voice is plain and regulatory, never promotional; the system rejects the dark crypto dashboard with glowing edges and the three-feature-card SaaS landing.

Density is that of a printed label: tight rows, tabular numbers, short condensed heads. Motion is minimal and physical: rule rows print in once, simulator verdicts land as a pressed stamp.

**Key Characteristics:**
- One saturated cobalt carton field per page; the panel is the only white surface.
- A three-weight rule hierarchy (9px, 4px, 1px) does all structural work inside the panel.
- Archivo Variable carries everything, with the width axis as the main expressive tool (62 for display, 75 for heads, 100 for reading).
- Square corners everywhere; no radius in the system.
- Yellow means the one action, red means blocked or paused, green means allowed or done.

## Colors

A loud carton print: one electric primary field, black ink on white panel, and three signal colors with fixed meanings.

### Primary
- **Electric Cobalt Carton** (#1546ff): the page field behind everything; body background and the carton wrapper. In dark scheme it deepens to #1238d6.
- **Deep Cobalt** (#0d33c9): scrollbar track and the text color of the white open-card button on the carton. Dark scheme: #0a2694.

### Secondary
- **Highlight Sticker Yellow** (#ffd23f): the single primary action (the sticker button), the focus ring on the carton, text selection, caret on the carton, and error text on the carton.

### Tertiary
- **Tamper Red** (#cc2620): the paused tamper strip, the BLOCKED stamp, the PAUSED status chip, the danger sticker on the Guardian page, and inline alerts.
- **Allowed Green** (#0a7a3f): the ACTIVE status chip, the ALLOWED stamp, and success confirmations.

### Neutral
- **Facts Panel White** (#ffffff): the panel surface and inputs inside it. Dark scheme warms it to #f4f4f1 so it does not glare.
- **Label Ink** (#0b0b0c): all panel text, panel border, and every rule line (the hairline token resolves to the same ink).
- **Soft Ink** (#3b3b42): secondary panel text, section notes, ticket borders and text, record labels.
- **On-Carton White** (#ffffff): headline and primary text on the cobalt field.
- **On-Carton Soft** (#d6defe): lede paragraphs, inactive nav links, side copy, and fineprint on the carton.
- **Paused Slate** (#2b3352): the whole carton field when the viewed card is paused. Dark scheme: #1d2238.
- **Command Well** (#ececea): background of inline shell commands and the prompt preview inside the panel.

### Named Rules
**The One Field Rule.** A page has exactly one carton color filling the viewport, cobalt when live and slate when paused. No gradients, no second field color, no cards floating on a neutral background.

**The Signal Meaning Rule.** Yellow is the one action, red is blocked or paused, green is allowed or done. None of the three is used decoratively.

## Typography

**Display Font:** Archivo Variable (with Archivo, system-ui)
**Body Font:** Archivo Variable at normal width
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo, Consolas, for addresses, commands, tickets and reason codes

**Character:** One grotesque family stretched across its width axis, from compressed label-print heads to normal-width reading text, the way a regulated panel mixes condensed heads with plain body copy. Mono is reserved for things a visitor might copy or verify.

### Hierarchy
- **Display** (900, wdth 62, clamp(44px, 9vw, 96px), line-height 0.92, -0.02em, uppercase, balanced wrap): the one-line claim on the carton (lede h1).
- **Headline** (900, wdth 62, clamp(40px, 8vw, 58px), line-height 0.95, -0.015em): the "Policy Facts" panel title. The wordmark uses the same face at 22px, uppercase.
- **Title** (900, wdth 75, 20px): panel section heads (Rules, Limits, Warnings, Directions, Try an attack). Side-column heads on the carton use 800, wdth 75, 22px, uppercase.
- **Body** (400, wdth 100, 16px, line-height 1.5): reading text; panel rows at 15px, warnings at 14px; lede paragraphs 18px at max 58ch, side copy max 46ch.
- **Label** (800, wdth 75, 13px, 0.04em): status chips and rule numbers ("Rule 01", tabular). Section notes are 500 weight, wdth 100, 13px in Soft Ink.
- **Record figure** (800, 22px, tabular): attestation counts in the record grid.

### Named Rules
**The Width Axis Rule.** Hierarchy is expressed through `wdth` first (62, 75, 100), then weight. Display and stamps are wdth 62, heads and labels wdth 75, reading text wdth 100.

**The Tabular Facts Rule.** Every number, rule number, limit value and count uses tabular figures so columns align like a printed label.

## Layout

A single centered column on the carton, max-width 1080px with a 16px side gutter and 64px bottom padding. The top bar holds the wordmark and a two-link nav, 18px vertical padding. The lede block (max 820px, 40px top, 36px bottom) sets the claim on the carton above the content.

Below it, a two-column grid: the facts panel at up to 600px and a carton-side column taking the rest, 40px gap, top-aligned. At 900px and below it collapses to one column, and the panel spans the page width minus gutters. Side sections stack with 36px between them; fineprint sits 48px below at max 70ch.

Inside the panel, rhythm is tight: rows 6px vertical padding with 10px column gap, Directions steps 10px padding with a 28px numeral column, sections 8px top padding plus 10px gap above each 4px section rule. Limits rows use a two-column label/value grid (minmax(9em, 1fr) and 1.3fr) with right-aligned bold values; the record is a two-column definition grid with a full-width row for hashes.

## Elevation & Depth

The system is flat print. Depth comes from the white panel sitting on the saturated field and from black rules, not from shadows. The single exception is the yellow sticker, which carries a soft cast shadow so it reads as a physical sticker applied on top of the print; it lifts 1px on hover and presses 1px down on active.

### Shadow Vocabulary
- **Sticker rest** (`box-shadow: 0 6px 14px -6px rgba(11, 11, 12, 0.5)`): primary sticker button at rest.
- **Sticker lift** (`box-shadow: 0 9px 18px -8px rgba(11, 11, 12, 0.55)`): sticker hover, with translateY(-1px).

### Named Rules
**The Only The Sticker Lifts Rule.** No panel, card, chip or input casts a shadow. The sticker is the only element allowed to sit above the print.

## Shapes

Square corners throughout (0px radius, including inputs, which reset browser rounding). Form comes from borders: the panel and every control carry a 2px Label Ink border; stamps carry 3px; tickets use a 1px dashed Soft Ink border that turns solid on hover. The rule hierarchy is the panel's skeleton: a 9px heavy rule under the title, 4px rules between sections, 1px hairlines between rows. Stamps are the one rotated form (-4deg). The tamper strip bleeds to the panel edges with a 45-degree repeating stripe at 14% white.

## Components

### Buttons
- **Shape:** square (0px), 2px Label Ink border.
- **Primary (Sticker):** Highlight Sticker Yellow with Label Ink text, 900 weight at wdth 75, 20px, padding 12px 20px, optional 20px square-capped copy icon with 8px gap. The only primary action on a screen (Copy prompt, Copy link, Jump to directions).
- **Hover / Active / Disabled:** lifts 1px with a deeper shadow over 160ms cubic-bezier(0.16, 1, 0.3, 1); presses 1px on active; disabled at 50% opacity.
- **Danger Sticker:** Tamper Red with white text, used only for Pause on the Guardian page. Disabled turns to white panel with red border and text, a 10px red-tinted diagonal stripe, and no shadow.
- **Secondary (Try it):** white panel, Label Ink 2px border, 700 weight, 14px, padding 6px 12px; inverts to ink on hover. Used for simulator rows, Verify line, and wallet connect/disconnect.
- **On-carton button:** white fill with Deep Cobalt text, 800 weight, 2px white border, paired with a transparent outlined input (the open-a-card form).

### Status chips
- **Style:** inline, 1px 8px padding, 2px currentColor border, label type.
- **State:** ACTIVE in Allowed Green, PAUSED in Tamper Red, NO CARD and DRAFT in Soft Ink.

### Cards / Containers (Facts Panel)
- **Corner Style:** square.
- **Background:** Facts Panel White, Label Ink text.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 2px Label Ink.
- **Internal Padding:** 18px 18px 22px. Title, sub-line (status chip, mono address, tickets), 9px heavy rule, then sections separated by 4px rules, ending in a panel foot above a 1px hairline in 12px Soft Ink.

### Inputs / Fields
- **Style:** 2px Label Ink border, white panel fill, mono 14px, padding 8px 10px, square corners; label above in 600 weight 14px with an optional Soft Ink small hint. Caret is cobalt inside the panel.
- **Segmented choice:** a 2px-bordered row of options divided by 2px rules; the checked option inverts to ink with white text.
- **Focus:** 3px outline offset 2px, yellow on the carton and cobalt inside the panel; segmented options use an inset cobalt outline.
- **Error:** Tamper Red 700-weight alert text below the field; on the carton, errors are yellow.

### Navigation
- Top bar: uppercase wdth 62 wordmark at 22px on the left, two links (Publish, Guardian) at 600 weight 15px on the right in On-Carton Soft. Hover and current page switch to white with a 1px underline. Same layout on phones.

### Rule rows (signature)
Numbered rules ("Rule 01") in a two-column grid, label column in wdth 75 tabular. Rows print in once on load: 380ms from 35% opacity and 4px down, staggered 45ms per row, only when motion is allowed.

### Origin Ticket (signature)
A small dashed stub in 11px mono Soft Ink, padding 0 6px, linking to BscScan (block, tx, contract events, code, read contract). Turns solid and ink on hover. Placed beside the fact it proves.

### Verdict Stamp (signature)
Replaces the Try it button after a simulator run: 900 weight, wdth 62, 18px, 0.04em, 3px currentColor border, rotated -4deg, with the reason code beneath in 10px mono. BLOCKED in Tamper Red, ALLOWED in Allowed Green. Lands in 260ms from scale 1.6, transparent and 2px blur. No animation under reduced motion.

### Tamper Strip and Paused Carton (signature)
When a card is paused, the carton background transitions to Paused Slate over 400ms, and a red strip bleeds across the panel top (negative 18px margins) reading "Paused · every guarded action is blocked" in 900 weight, wdth 62, 18px, uppercase, over a 45-degree stripe of 14px bands at 14% white.

## Do's and Don'ts

### Do:
- **Do** keep one carton field per page: #1546ff live, #2b3352 paused, nothing else behind the panel.
- **Do** structure the panel only with the 9px / 4px / 1px Label Ink rule hierarchy.
- **Do** express type hierarchy through Archivo's width axis (62, 75, 100) before weight.
- **Do** put an origin ticket beside any fact that chain data can prove.
- **Do** use the yellow sticker for exactly one primary action per screen.
- **Do** show the paused state on the whole surface (slate carton plus tamper strip), not as a badge alone.
- **Do** use tabular figures for every number and mono for addresses, commands and hashes.
- **Do** respect reduced motion: no stamp animation, no row print, no carton color transition.

### Don't:
- **Don't** round corners anywhere; the system radius is 0px.
- **Don't** cast shadows from panels, chips, inputs or secondary buttons; only the sticker lifts.
- **Don't** use yellow, red or green decoratively; each carries one meaning.
- **Don't** build a dark crypto dashboard with glowing edges or a three-feature-card SaaS grid.
- **Don't** fill the panel with decoration or invented data; it holds real card data or an honest empty state.
- **Don't** show a name lookup next to an address; addresses appear as 0x values only.
