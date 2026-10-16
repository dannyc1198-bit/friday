# Friday audit — 2026-10-15

Ranked by impact on a daily driver that also has to survive a screen share. Items 1–7 are fixed on this branch. The rest are still open.

## Fixed

1. **Chat default was not a real model.** `OPENAI_MODEL` fell through to `gpt-6-astra`, which is not in the OpenAI model list. Every chat would 404. The default is now `gpt-5.4`, confirmed on the OpenAI model page on 2026-10-15. Override with `OPENAI_MODEL`.
2. **Reflection and the thinking loop spent the flagship, then could fail over to Grok.** Both now call `gpt-5.4-mini` (`FRIDAY_REFLECT_MODEL`) with failover off. A bad mini id fails that pass. It does not silently bill `grok-4.7`.
3. **Needs-key rows hid the env var.** The server already returned details such as `needs key — set MESHY_API_KEY`. The Agents and integrations list replaced that with the words "needs key". The HUD now shows the detail, and the setup checklist prints the env name in gold when a check is red.
4. **A screen share leaked the real workspace.** Wavelength, Ally, the boot line "Hey Daniel…", live neural notes, agent names, and health chips all rendered live data. Demo mode is off by default (`localStorage` key `friday-demo`). On, every tab shows labelled SAMPLE data, buttons say nothing was sent, and Talk does not call the model or live voice.
5. **Secondary text failed contrast.** `deck.dim` `#5a8aaa` and `deck.faint` `#2e4e68` on `#020a14` were too dim for small labels. They are now `#9ec3d6` and `#7f9eb4`, including the CSS variables `--fri-text-dim` and `--fri-text-ultra-dim`.
6. **No first-run checklist.** `GET /api/setup` returns booleans and env names only: `OPENAI_API_KEY`, optional `XAI_API_KEY`, `OBSIDIAN_VAULT_PATH`, and voice via `ELEVENLABS_API_KEY` plus `ELEVENLABS_AGENT_ID` or `OPENAI_API_KEY`. The Today tab renders green and red dots. Hide is reversible from the command palette (Show setup).
7. **No way to jump the deck.** Ctrl+K or Cmd+K opens a command palette (Esc, arrows, Enter). It does not take Ctrl+Enter, which still toggles live voice when demo is off. A Commands button is in the header for pointer use.

## Still open

1. **Root `README.md` still narrates Claude, a Gemini router, and 120 tools.** A pointer at the top now sends people to `docs/MODELS.md`. The body is the old pitch and will mislead anyone who skips the pointer.
2. **`next@14.2.3` stays on purpose.** The known advisory is unfixed so this branch does not take an unplanned framework bump.
3. **Vault recall is BM25, not embeddings.** That is intentional: local, free, and already wired. Chat memory is the only embedding consumer, at 1536 dimensions. Moving the vault to `text-embedding-3-large` would break stored vectors and add cost.
4. **Live WebRTC was not opened on this machine.** There is no ElevenLabs agent id and no OpenAI key in this environment, so a real Agents session and a real Realtime session are unverified here.
5. **Health after a repair is a localhost ping unless `FRIDAY_HEALTHCHECK=1`.** Tests stay off unless `FRIDAY_HEALTHCHECK_TESTS=1`. The repair path still never merges `main` or `master` and never edits `.env`.
6. **`scripts/configure-elevenlabs-agent.ts` was not executed here.** It needs a real agent id and a public `FRIDAY_PUBLIC_URL`.
7. **Demo is per browser profile.** A fresh profile, or another browser, starts with live data. Turn Demo on before sharing.
8. **`gpt-5.4` long-context pricing** doubles input and multiplies output by 1.5 above 272k tokens for the whole session. Keep the system prompt and tool list stable and under that line.
