# Friday model roles

Checked against vendor docs on **2026-10-15**. Prices are USD per 1M tokens unless noted. Defaults live in `apps/orchestrator/src/services/model-roles.ts` and can be overridden without a code change.

The brain order is OpenAI, then xAI, then Gemini. A saved choice in `data/settings.json` (or `set_brain_provider`) is tried first and overrides `FRIDAY_LLM_PROVIDER`. A provider with no key is skipped. Quota and `429` responses, including `insufficient_quota` and `credit_balance_exhausted`, fall through to the next provider immediately. A 400 or 422 stays on the provider that rejected it.

## Roles

| Role | Default id | Env override | Price (input / cached / output) | Why this one |
| --- | --- | --- | --- | --- |
| Main chat and tool calling | `gpt-5.4` | `OPENAI_MODEL` or `FRIDAY_LLM_MODEL` | $2.50 / $0.25 / $15 | Flagship Chat Completions model. Function calling is supported. Tools stay on this model inside the existing stream so tool-argument assembly is one loop. |
| Routing, nightly reflection, thinking loop | `gpt-5.4-mini` | `FRIDAY_REFLECT_MODEL` | $0.75 / $0.075 / $4.50 | Same family, about a third of the flagship input price. These passes do **not** fail over to Grok. A missing mini id fails that pass instead of spending flagship or Grok rates. |
| Chat-memory embeddings | `text-embedding-3-small` | `EMBEDDING_MODEL` | $0.02 | 1536 dimensions in `services/memory/embedding.ts`. Stored chat vectors already use that size. |
| Voice fallback | `gpt-realtime-2.1` | `FRIDAY_REALTIME_MODEL` | Text $4 / $0.40 / $24. Audio $32 / $0.40 / $64 | OpenAI's current Realtime model. Used only when ElevenLabs Agents cannot connect. |
| Fallback brain | `grok-4.7` | `XAI_MODEL` | $2 / $0.50 / $6 under 200k prompt tokens. At or above 200k: $4 / $1 / $12 | xAI's most capable public chat model. Function calling is supported. Context window 500k. |

`gpt-5.4-nano` is $0.20 / $0.02 / $1.25. It is the cheaper sibling and a valid `FRIDAY_REFLECT_MODEL` if a reflection pass should be even smaller. Mini is the default because the thinking loop writes vault insights.

## Context surcharges

- `gpt-5.4`: prompts over 272k input tokens are priced at 2× input and 1.5× output for the whole session. Snapshot `gpt-5.4-2026-03-05`. Knowledge cutoff 31 Aug 2025. Context window 1,050,000.
- `gpt-5.4-mini`: snapshot `gpt-5.4-mini-2026-03-17`. Knowledge cutoff 31 Aug 2025. Context window 400,000. Max input 272,000.
- `grok-4.7`: knowledge cutoff May 2026. Long-context pricing starts at 200k prompt tokens and applies to every token in that request. The US endpoint `https://us.api.x.ai/v1` is 1.1× and is not the default. `grok-4.7` Fast is a Cursor product, not this API id.

## Voice

The live voice layer is ElevenLabs Agents: TTS `eleven_v3_conversational`, speech-to-text `scribe_realtime` (Scribe v2 Realtime), turn-taking `turn_v3`. The agent's custom LLM is Friday's `/v1/chat/completions`, so the spoken brain is still the provider chain above. Set `ELEVENLABS_AGENT_LLM` to an ElevenLabs model id such as `gemini-2.5-flash` to use ElevenLabs' built-in LLM with no public URL. `ELEVENLABS_VOICE_ID` selects the voice. OpenAI Realtime is the next try, voice `cedar` via `FRIDAY_REALTIME_VOICE`. If the agent id is missing and Realtime cannot speak, hands-free uses ElevenLabs TTS and then the Edge voice.

## Coding

Coding delegation is the Codex CLI (`codex exec`, stdin closed) and then the xAI code model `grok-code-fast-1` (`XAI_CODE_MODEL`). Claude Code is not registered.

## Embeddings and the vault

Obsidian recall is MiniSearch BM25 in `services/brain.ts`. It does not call an embedding model, so vault search stays local and free. `text-embedding-3-small` is only for the JSON chat-memory file.

`text-embedding-3-large` is $0.13 per 1M tokens and 3072 dimensions. Switching `EMBEDDING_MODEL` to it changes the vector size and will not match vectors already stored at 1536. Leave the default unless that store is rebuilt.

## What we did not pick

- `gpt-6-astra` is not an OpenAI model id. An earlier default would 404 on Chat Completions.
- A second model inside the tool loop. Tool calls stay on `gpt-5.4`.
- Failing the cheap reflection pass over to `grok-4.7`. That would erase the savings.

## Sources

- https://developers.openai.com/api/docs/models/gpt-5.4
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://developers.openai.com/api/docs/models/text-embedding-3-small
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1
- https://docs.x.ai/docs/models
