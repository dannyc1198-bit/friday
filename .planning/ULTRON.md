# JARVIS — Self-Evolution Roadmap

> Side spec. Not part of the active 10-phase build.
> Activates after core JARVIS is stable (post-Phase 9).

## Vision

JARVIS doesn't stay static. It learns from every interaction, adapts its behavior,
and eventually writes its own upgrades. The progression is earned, not given.

## Capability Tiers

| Tier | Codename | Unlocked By | Capabilities |
|------|----------|-------------|-------------|
| 1 | **JARVIS** | Default | Follows instructions, uses existing tools, streaming chat |
| 2 | **FRIDAY** | Phase 7+ complete | Learns preferences, adapts behavior, suggests improvements, proactive nudges |
| 3 | **JARVIS** | Post-Phase 9 | Self-modifying — writes new tools, creates updates, proposes architecture changes |

## Tier 1 — JARVIS (Base)

What exists today:
- Execute registered tools on command
- Stream responses with personality
- Ralph Wiggum thinking loop for complex tasks
- Mentor Mode advisory personality

## Tier 2 — FRIDAY (Adaptive)

Learns and adjusts without modifying its own code:
- **Interaction Memory** — tracks what tools get used, what fails, what gets asked repeatedly
- **Preference Engine** — learns default values (preferred light temp, music volume, response verbosity)
- **Pattern Detection** — identifies recurring workflows and suggests shortcuts
- **Proactive Suggestions** — "You usually check email around now" / "Traffic is bad, leave early"
- **System Prompt Tuning** — adjusts its own prompt weights based on feedback signals

Storage: ChromaDB long-term memory + local preference store

## Tier 3 — JARVIS (Self-Evolving)

Writes and proposes changes to its own codebase:
- **Tool Authoring** — drafts new tool files based on repeated manual requests
- **Self-Patching** — identifies bugs or inefficiencies, writes fixes
- **Version Management** — creates changelogs, bumps versions, tags releases
- **Architecture Proposals** — suggests refactors when technical debt accumulates
- **Test Generation** — writes tests for its own new code

### Approval Gate (Mandatory)

```
JARVIS proposes change
  → Generates diff + explanation + risk assessment
  → Presents to owner for review
  → Owner approves / rejects / modifies
  → If approved: change deploys, changelog updated
  → If rejected: JARVIS logs feedback, learns from rejection
```

No self-generated change goes live without explicit sign-off. Ever.

### Safety Mechanisms

- **Rollback System** — every self-modification is versioned, one-click revert
- **Sandbox Testing** — proposed changes run in isolated environment first
- **Kill Switch** — hard stop that reverts to last known-good state
- **Scope Limits** — JARVIS cannot modify its own approval gate or safety mechanisms
- **Audit Log** — every proposed change logged with reasoning, diff, and outcome

## Tier Progression Triggers

Tier upgrades are NOT automatic. They require:
1. All prerequisite phases complete and tested
2. Owner explicitly activates the next tier
3. A stability period where the current tier runs without issues

```
JARVIS (Phase 0-6) → FRIDAY (Phase 7+) → JARVIS (Post-Phase 9)
```

## Implementation Notes

- Preference engine needs a feedback signal (thumbs up/down on responses, or implicit from behavior)
- Tool authoring uses the LLM to generate code, but the tool registry validates schema before registration
- ChromaDB or similar vector store needed for long-term interaction memory
- Self-patching requires git integration — JARVIS creates branches, never commits to main directly

## Open Questions (For Later)

- Should FRIDAY-tier changes (preference tuning) also require approval, or just JARVIS-tier?
- What's the minimum stability period before tier upgrades?
- Should JARVIS have a "confidence threshold" where low-confidence proposals get extra review?
- Can JARVIS propose new phases to the build spec, or only work within existing architecture?
