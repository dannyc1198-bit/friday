// Point the existing ElevenLabs agent at Friday.
// Docs: PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}
// Custom LLM must be a public https URL. ElevenLabs cannot call 127.0.0.1.
//
//   ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_ID=... \
//   FRIDAY_PUBLIC_URL=https://your-tunnel.example \
//   ELEVENLABS_SECRET_ID=... \
//   npx tsx scripts/configure-elevenlabs-agent.ts
//
// Create the secret in the ElevenLabs dashboard (name FRIDAY_API_KEY, value
// is the orchestrator bearer). The script sends the secret id, never the key.

import { DANIEL_VOICE_ID, buildElevenLabsAgentPatch } from "../apps/orchestrator/src/services/elevenlabs-agent.js";

const agentId = process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "";
const apiKey = process.env.ELEVENLABS_API_KEY || "";
const publicUrl = (process.env.FRIDAY_PUBLIC_URL || "").replace(/\/$/, "");
const voiceId = process.env.ELEVENLABS_VOICE_ID || process.env.FRIDAY_VOICE_ID_JARVIS || DANIEL_VOICE_ID;
const secretId = process.env.ELEVENLABS_SECRET_ID || "";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!apiKey) fail("Set ELEVENLABS_API_KEY.");
if (!agentId) fail("Set ELEVENLABS_AGENT_ID (same value as NEXT_PUBLIC_ELEVENLABS_AGENT_ID).");
if (!publicUrl.startsWith("https://")) {
  fail("Set FRIDAY_PUBLIC_URL to the public https origin of this orchestrator. ElevenLabs cannot reach localhost.");
}

const patch = buildElevenLabsAgentPatch({
  voiceId,
  customLlmUrl: `${publicUrl}/v1/chat/completions`,
  secretId: secretId || undefined,
});

const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
  method: "PATCH",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(patch),
});

if (!response.ok) {
  const detail = await response.text();
  fail(`ElevenLabs rejected the agent update (${response.status}). ${detail.slice(0, 400)}`);
}

console.log(`Updated agent ${agentId}.`);
console.log("TTS: eleven_v3_conversational, expressive mode on.");
console.log("ASR: scribe_realtime (Scribe v2 Realtime in the Agents API).");
console.log("Turn-taking: turn_v3.");
console.log(`Voice: ${voiceId}.`);
console.log(`Custom LLM: ${publicUrl}/v1/chat/completions`);
if (!secretId) {
  console.log("No ELEVENLABS_SECRET_ID. Create a workspace secret for FRIDAY_API_KEY and run this again, or the custom LLM call will be unauthorized.");
}
