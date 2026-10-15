# Friday Interface System

## Direction

Friday is a calm, dense flight-deck instrument for one operator. It should feel like a trustworthy operational console: quiet deep-space surfaces, precise readings, restrained electric-blue accents, and clear safety states. Interfaces should expose real system state and evidence rather than decorative or invented telemetry.

The product domain is cognition, missions, evidence trails, safety gates, live system readings, outcome measurement, and recovery. The recurring signature is a **flight recorder**: important actions show where information came from, its current lifecycle state, its measured result, and the available recovery path.

Avoid generic SaaS card grids, ornamental gradients, oversized empty areas, gratuitous glow, and color without meaning. Each view must have one dominant task.

## Existing Tokens

Use the semantic Flight Deck tokens already defined in `apps/web/tailwind.config.ts` before adding colors:

- Canvas: `deck-void` (`#020a14`)
- Panel: `deck-panel` (`#071422`)
- Raised/selected: `deck-raised` (`#0d2240`)
- Primary text: `deck-ink` (`#e0f0ff`)
- Secondary text: `deck-dim` (`#5a8aaa`)
- Metadata/disabled: `deck-faint` (`#2e4e68`)
- Primary action/accent: `deck-amber` (`#00b4ff`, legacy token name)
- Lit accent: `deck-hot` (`#00dcff`)
- Success/proven: `deck-ok` (`#66ffb2`)
- Destructive/quarantined/failure: `deck-alert` (`#ff5252`)
- Standard boundary: `deck-line`
- Emphasized/focus boundary: `deck-line-bright`

Maintain approximately 60% canvas, 30% panel/raised surfaces, and 10% semantic accent. Cyan indicates focus, navigation, or active cognition; mint indicates safe/proven/online; red is reserved for failure, quarantine, destructive actions, and rollback warnings.

## Depth and Shape

Use **surface shifts plus quiet borders**, not drop shadows, as the depth strategy. The elevation order is:

1. `deck-void` — application canvas
2. `deck-panel` — instruments, queues, tables, detail surfaces
3. `deck-raised` — selected rows, hover state, inset table headers

Use `border-deck-line` for normal structure and `border-deck-line-bright` only for focus, selection, or emphasis. Do not mix this with dramatic shadows or strong gradients.

Use the existing `rounded-hud` 6px radius for panels and controls. Nested elements should be slightly tighter than their parent when visually necessary. Controls must have at least a 40px hit area; prefer 44px where layout permits.

## Spacing and Density

The base unit is **4px**. Hold to multiples of four.

- Micro gaps: 4–8px
- Control gaps and compact padding: 8–12px
- Panel padding: 12–20px
- Section gaps: 20–24px
- Major view separation: 32px+
- Top application bar: 56px high

The interface is workbench-dense. Related controls stay tight; major groups receive more air. Do not give every section identical spacing or identical card proportions.

## Typography and Hierarchy

Use the loaded Flight Deck families:

- `font-deckdisplay` / Chakra Petch — product headings, panel names, procedure names
- `font-deckbody` / IBM Plex Sans — explanations and readable content
- `font-deckmono` / IBM Plex Mono — metrics, states, timestamps, labels, and machine output

Use a compact type scale around a 1.2 ratio:

- Metadata label: 9–10px, uppercase, tracked 0.14–0.20em, muted
- Supporting text: 11–13px, regular, secondary
- Body: 13–14px, regular/medium, primary or secondary
- Component heading: 14–16px, 600, primary
- View heading: 24–28px, 600, slightly tight tracking

Weight and color should establish hierarchy before adding size. Use `tabular-nums` for live counts, scores, timestamps, and measurements. Balance headings and pretty-wrap descriptive copy.

## Focal Pattern

Every view names one operator action and makes it dominant. For Learning Lab the focal action is reviewing a proposal; the queue is the entry point and the selected proposal owns the largest surface. Supporting metrics and history remain visibly subordinate.

For future views, do not default to a collection of equal cards. Choose one dominant instrument, then arrange context around it.

## Reusable Component Patterns

### Application top bar

56px high · horizontal padding 16px mobile / 24px desktop · bottom `deck-line` border · square 40px navigation control · display title plus tiny mono subtitle. Primary navigation stays visible but visually secondary to the current view.

### Instrument panel

`deck-panel` background · 1px `deck-line` border · 6px radius · 12–20px content padding. Panel headers use 11px/600 display text, uppercase, 0.20–0.22em tracking, and the cyan accent.

### Queue row

Minimum 64px high · 8–12px padding · 12px internal gap · native button semantics. A 2px vertical lifecycle rail communicates state. Selected rows use `deck-raised`; hover uses a partial raised tint. Title is 14px/600 display; description is 11px secondary; state badge is 9px mono.

### Lifecycle/status badge

Small 1px semantic border · quiet semantic background tint · 9px uppercase mono · 0.16em tracking. Pending is cyan, active/proven is mint, quarantine/failure is red, history/rolled-back is muted. The text label must always accompany color.

### Decision controls

40px minimum height · 12px horizontal padding · 6px radius · 10px uppercase mono. Approval uses mint; reject and rollback use red only at the confirmation/destructive stage. Every mutation requires two visible steps: intent, then explicit confirmation. Include cancel, busy, disabled, success, and error states.

### Metric

Value: 24px/500 mono with tabular numerals. Label: 9px uppercase mono, tracked 0.18em, muted. Metrics should be unboxed when they serve a nearby hero section; avoid repetitive metric cards.

### Telemetry table

Panel container with horizontal overflow on narrow screens. Header uses a subtle raised tint and 9px uppercase mono labels. Rows use quiet dividers and raised-tint hover. Quality must show a label and score, never color alone.

### Evidence and machine output

Evidence uses a 2px accent rail and 11px readable copy. Exact procedures, payloads, or logs use an inset `deck-void` surface with 11px mono text and controlled scrolling. Preserve whitespace when it is meaningful.

## Interaction and Motion

- Default interaction duration: 100–180ms
- Animate only color, opacity, and transform
- Press feedback: `scale(0.97)`; never below 0.95
- Avoid animation for high-frequency operational actions
- Respect reduced-motion preferences
- Every control needs default, hover, active, focus-visible, disabled, and busy behavior
- Every data view needs loading, empty, error, populated, and stale/offline behavior where applicable

Use native buttons and links first. Do not build clickable `div` elements. Keep keyboard focus visible with the cyan focus token.

## Responsive Rules

Desktop may use a queue/detail split with the queue around 280–360px and the detail surface taking the remaining width. On narrow screens, stack the queue above detail and keep the selected item obvious. Tables may scroll horizontally inside their own panel; the page itself must never overflow horizontally.

Verify new or changed surfaces at approximately 1440px desktop and 390px mobile widths. Check browser console errors, page overflow, focus behavior, loading/empty/error states, and all destructive confirmation paths.

## Reference Implementation

The Learning Lab is the current reference for governed operational UI:

- `apps/web/src/app/learning/page.tsx`
- `apps/web/src/components/deck/Deck.tsx`
- `apps/web/tailwind.config.ts`

When future UI decisions conflict with older decorative HUD styles, prefer this restrained Flight Deck system unless the user explicitly requests a new direction.
