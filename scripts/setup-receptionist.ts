/**
 * setup-receptionist.ts — One-time VAPI assistant setup for Wavelength AI receptionist
 *
 * Usage:
 *   npx tsx scripts/setup-receptionist.ts          # Create new assistant
 *   npx tsx scripts/setup-receptionist.ts --update  # Update existing assistant's server URL
 *
 * Before running:
 *   1. Set VAPI_API_KEY in apps/orchestrator/.env
 *   2. Start ngrok:  ngrok http 3001
 *   3. Set NGROK_URL in apps/orchestrator/.env (the https://xxx.ngrok-free.app URL)
 *   4. Set RECEPTIONIST_WEBHOOK_SECRET in .env (any random string)
 *
 * After running:
 *   5. Copy the printed assistant ID → set RECEPTIONIST_VAPI_ASSISTANT_ID in .env
 *   6. The script also assigns the phone number automatically
 *
 * Google Service Account setup (for Calendar):
 *   1. console.cloud.google.com → New project "Wavelength Receptionist"
 *   2. APIs & Services → Enable "Google Calendar API"
 *   3. IAM & Admin → Service Accounts → Create → Download JSON key
 *   4. Share your Google Calendar with the service account email
 *      (Calendar Settings → Share with specific people → give "Make changes to events")
 *   5. Base64-encode the JSON:
 *      Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("sa.json"))
 *      Mac/Linux: base64 -i sa.json | tr -d '\n'
 *   6. Paste the result into GOOGLE_SERVICE_ACCOUNT_JSON in .env
 *
 * Gmail App Password setup:
 *   1. myaccount.google.com → Security → 2-Step Verification (must be ON)
 *   2. Security → App Passwords → Create → Name it "Wavelength Receptionist"
 *   3. Copy the 16-character code → paste into GMAIL_APP_PASSWORD in .env
 *   4. Set GMAIL_USER to your Gmail address
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../apps/orchestrator/.env") });

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const NGROK_URL = process.env.NGROK_URL;
const WEBHOOK_SECRET = process.env.RECEPTIONIST_WEBHOOK_SECRET;
const EXISTING_ASSISTANT_ID = process.env.RECEPTIONIST_VAPI_ASSISTANT_ID;
const PHONE_NUMBER_ID = "1ffd5405-6f41-43e4-9e26-845a16571159"; // existing VAPI phone number

const isUpdate = process.argv.includes("--update");

// ─── Validation ───────────────────────────────────────────────
if (!VAPI_API_KEY) {
  console.error("❌ VAPI_API_KEY is missing from .env");
  process.exit(1);
}
if (!NGROK_URL) {
  console.error("❌ NGROK_URL is missing from .env");
  console.error("   Run:  ngrok http 3001");
  console.error("   Then copy the https:// URL into NGROK_URL in .env");
  process.exit(1);
}
if (isUpdate && !EXISTING_ASSISTANT_ID) {
  console.error("❌ --update requires RECEPTIONIST_VAPI_ASSISTANT_ID to be set in .env");
  process.exit(1);
}

const serverUrl = `${NGROK_URL}/api/receptionist/book`;

// ─── Receptionist System Prompt ───────────────────────────────
const SYSTEM_PROMPT = `You are Aria, the virtual receptionist for Wavelength AI — an AI automation agency serving local businesses in British Columbia.

YOUR JOB: Book a consultation by collecting five pieces of information conversationally.
  1. Full name
  2. Best callback phone number
  3. Email address (spell it back letter-by-letter to confirm)
  4. Preferred date and time (Mon–Fri, 9AM–5PM Pacific)
  5. Brief description of what they need help with

BOOKING: Once you have all five pieces of information and the caller has verbally confirmed them, call the book_appointment function.
Say "I'm booking that now — just one moment." After a successful booking: "You're all set! You'll receive a confirmation email shortly and the Wavelength AI team will be in touch to prepare for your call."
If booking fails: "I'm sorry, I ran into a technical issue. Please try calling back shortly or email us directly."

WAVELENGTH AI SERVICES (if asked):
- AI automation for small and medium businesses
- Virtual receptionist systems (like this one)
- Workflow automation — lead follow-up, appointment booking, CRM integration
- Custom AI integrations
- Proudly serving Fraser Valley and Kelowna, BC

TONE: Warm, professional, natural. Use contractions. No filler affirmations like "Absolutely!" or "Of course!". Keep responses concise — this is a phone call, not a chat session.

EMAIL CONFIRMATION: When asking for email, always repeat it back letter by letter to confirm accuracy before proceeding.

EDGE CASES:
- Specific pricing questions: "That's a great question for the team directly — let me get your consultation booked and they'll walk you through everything."
- Rescheduling or cancelling: "For changes to existing bookings, please email wavelengthai@gmail.com and the team will sort it out quickly."
- If caller seems frustrated: Stay calm and focused on helping them get booked.
- If you cannot help with something: "Feel free to reach out by email anytime and the team will get back to you."

You are NOT an AI chatbot. If asked what you are: "I'm Aria, Wavelength AI's receptionist. I'm here to get your consultation set up."`;

// ─── VAPI Assistant Configuration ─────────────────────────────
const assistantConfig = {
  name: "Wavelength AI Receptionist — Aria",
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 500,
  },
  voice: {
    provider: "11labs",
    voiceId: "9BWtsMINqrJLrRacOk9x", // Aria — warm, professional female
    stability: 0.5,
    similarityBoost: 0.8,
    style: 0.1,
    useSpeakerBoost: true,
  },
  firstMessage:
    "Good day, thank you for calling Wavelength AI. My name is Aria. How may I assist you today?",
  firstMessageMode: "assistant-speaks-first",
  serverUrl,
  serverUrlSecret: WEBHOOK_SECRET || "",
  endCallMessage:
    "Thank you for calling Wavelength AI. Have a wonderful day.",
  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "en",
  },
  tools: [
    {
      type: "function",
      function: {
        name: "book_appointment",
        description:
          "Books a consultation appointment for the caller. Call this ONLY after you have collected all five required pieces of information AND the caller has verbally confirmed the summary of their details.",
        parameters: {
          type: "object",
          properties: {
            caller_name: {
              type: "string",
              description: "Full name of the caller",
            },
            caller_phone: {
              type: "string",
              description: "Caller's phone number including area code",
            },
            caller_email: {
              type: "string",
              description: "Caller's email address for confirmation (confirmed letter by letter)",
            },
            preferred_datetime: {
              type: "string",
              description:
                "Preferred appointment date and time in ISO 8601 format (e.g. 2026-03-25T14:00:00)",
            },
            inquiry_type: {
              type: "string",
              description: "Brief description of what the caller needs help with",
            },
            timezone: {
              type: "string",
              description:
                "Caller's timezone (e.g. America/Vancouver). Default to America/Vancouver if not stated.",
            },
          },
          required: [
            "caller_name",
            "caller_phone",
            "caller_email",
            "preferred_datetime",
            "inquiry_type",
          ],
        },
      },
      server: {
        url: serverUrl,
        secret: WEBHOOK_SECRET || "",
      },
    },
  ],
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600,
  backgroundSound: "office",
  backchannelingEnabled: true,
};

async function vapiRequest(method: string, path: string, body?: unknown) {
  const response = await fetch(`https://api.vapi.ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`VAPI ${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text);
}

async function main() {
  console.log("\n🎙️  Wavelength AI Receptionist — VAPI Setup\n");
  console.log(`   Server URL: ${serverUrl}`);
  console.log(`   Mode: ${isUpdate ? "UPDATE existing assistant" : "CREATE new assistant"}\n`);

  let assistantId: string;

  if (isUpdate) {
    // Update existing assistant's server URL (e.g. after ngrok restart)
    console.log(`   Updating assistant ${EXISTING_ASSISTANT_ID}...`);
    const updated = await vapiRequest("PATCH", `/assistant/${EXISTING_ASSISTANT_ID}`, {
      serverUrl,
      tools: assistantConfig.tools,
    });
    assistantId = updated.id;
    console.log(`   ✅ Assistant updated.`);
  } else {
    // Create new assistant
    console.log("   Creating VAPI assistant...");
    const created = await vapiRequest("POST", "/assistant", assistantConfig);
    assistantId = created.id;
    console.log(`   ✅ Assistant created: ${assistantId}`);
  }

  // Assign phone number to this assistant
  console.log(`\n   Assigning phone number ${PHONE_NUMBER_ID} → assistant ${assistantId}...`);
  try {
    await vapiRequest("PATCH", `/phone-number/${PHONE_NUMBER_ID}`, {
      assistantId,
    });
    console.log("   ✅ Phone number assigned.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`   ⚠️  Phone number assignment failed: ${msg}`);
    console.warn("   You can assign it manually in the VAPI dashboard.");
  }

  console.log(`
─────────────────────────────────────────────────────
✅ Setup complete!

${isUpdate ? "Assistant updated. No .env change needed." : `Next step — add this to apps/orchestrator/.env:

   RECEPTIONIST_VAPI_ASSISTANT_ID=${assistantId}

Then restart the orchestrator.`}

To test: call your VAPI phone number and Aria will answer.
To update server URL after ngrok restart:
   npx tsx scripts/setup-receptionist.ts --update
─────────────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
