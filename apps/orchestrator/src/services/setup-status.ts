// First-run checklist. Booleans and env-var names only. Never a key or a home path.

export interface SetupCheck {
  id: string;
  label: string;
  ok: boolean;
  env: string;
  detail: string;
  optional?: boolean;
}

export function buildSetupChecks(input: {
  hasOpenAI: boolean;
  hasXai: boolean;
  vaultFound: boolean;
  hasElevenKey: boolean;
  hasElevenAgent: boolean;
}): SetupCheck[] {
  const voiceReady = (input.hasElevenKey && input.hasElevenAgent) || input.hasOpenAI;
  return [
    {
      id: "openai",
      label: "OpenAI key",
      ok: input.hasOpenAI,
      env: "OPENAI_API_KEY",
      detail: input.hasOpenAI
        ? "OpenAI is the primary brain."
        : "Set OPENAI_API_KEY in apps/orchestrator/.env. Chat stays offline until then.",
    },
    {
      id: "xai",
      label: "xAI fallback",
      ok: input.hasXai,
      env: "XAI_API_KEY",
      optional: true,
      detail: input.hasXai
        ? "xAI is ready if OpenAI quota or billing fails."
        : "Optional. Set XAI_API_KEY to fail over to Grok.",
    },
    {
      id: "vault",
      label: "Obsidian vault",
      ok: input.vaultFound,
      env: "OBSIDIAN_VAULT_PATH",
      detail: input.vaultFound
        ? "The vault folder is connected."
        : "Set OBSIDIAN_VAULT_PATH to the Obsidian folder. The default folder was not found.",
    },
    {
      id: "voice",
      label: "Voice",
      ok: voiceReady,
      env: "ELEVENLABS_API_KEY",
      detail: voiceReady
        ? input.hasElevenKey && input.hasElevenAgent
          ? "ElevenLabs Agents is configured."
          : "OpenAI Realtime can speak. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID for the primary voice."
        : "Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID, or OPENAI_API_KEY for Realtime. The browser voice still speaks.",
    },
  ];
}
