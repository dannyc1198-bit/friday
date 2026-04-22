// FRIDAY ↔ Telegram bridge (simple edition)
//
// Direct pipe from Telegram → FRIDAY /v1/chat/completions → reply.
// Bypasses OpenClaw entirely. Runs as its own node process.
//
// Env required:
//   TELEGRAM_BOT_TOKEN     — from @BotFather
//   TELEGRAM_ALLOWLIST     — comma-separated Telegram user IDs that can chat
//   FRIDAY_URL             — default http://127.0.0.1:3001
//   FRIDAY_API_KEY         — bearer token for FRIDAY's auth middleware

import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import "dotenv/config";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWLIST = (process.env.TELEGRAM_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s));
const FRIDAY_URL = process.env.FRIDAY_URL || "http://127.0.0.1:3001";
const FRIDAY_API_KEY = process.env.FRIDAY_API_KEY || "";

if (!BOT_TOKEN) {
  console.error("[telegram-bot] TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}
if (ALLOWLIST.length === 0) {
  console.error("[telegram-bot] TELEGRAM_ALLOWLIST is required (comma-separated Telegram user IDs)");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Per-user conversation history (in-memory; FRIDAY stores its own too)
const history = new Map<number, Array<{ role: "user" | "assistant"; content: string }>>();

function getHistory(userId: number) {
  let h = history.get(userId);
  if (!h) {
    h = [];
    history.set(userId, h);
  }
  return h;
}

// Hard-split long replies — Telegram caps single messages at 4096 chars
function splitForTelegram(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit);
    const at = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function askFriday(
  userId: number,
  userMessage: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const h = getHistory(userId);
  h.push({ role: "user", content: userMessage });

  try {
    const resp = await fetch(`${FRIDAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FRIDAY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "friday",
        stream: false,
        messages: h,
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `FRIDAY ${resp.status}: ${body.slice(0, 500)}` };
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (json.error) {
      return { ok: false, error: json.error.message || "unknown error" };
    }

    const text = json.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      return { ok: false, error: "empty response from FRIDAY" };
    }

    h.push({ role: "assistant", content: text });

    // Cap history at 40 turns — prevents unbounded growth
    if (h.length > 40) h.splice(0, h.length - 40);

    return { ok: true, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

bot.use(async (ctx, next) => {
  const id = ctx.from?.id;
  if (id == null || !ALLOWLIST.includes(id)) {
    console.log(`[telegram-bot] rejected ${id} (not in allowlist)`);
    return;
  }
  await next();
});

bot.start(async (ctx) => {
  await ctx.reply(
    "FRIDAY online. Talk to me, boss.\n\n" +
      "Commands:\n" +
      "/status — check orchestrator + tools\n" +
      "/reset — clear this conversation\n" +
      "/help — this message"
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    "Send any text and I'll pass it to FRIDAY.\n\n" +
      "/status — orchestrator health, tool count, conversation length\n" +
      "/reset — wipe this conversation's history\n" +
      "/help — show this message"
  );
});

bot.command("reset", async (ctx) => {
  const id = ctx.from?.id;
  if (id != null) history.delete(id);
  await ctx.reply("Conversation cleared.");
});

bot.command("status", async (ctx) => {
  const userId = ctx.from?.id;
  const convLen = userId != null ? (history.get(userId)?.length ?? 0) : 0;
  try {
    const [healthRes, toolsRes] = await Promise.all([
      fetch(`${FRIDAY_URL}/api/health`, {
        headers: { Authorization: `Bearer ${FRIDAY_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${FRIDAY_URL}/api/tools`, {
        headers: { Authorization: `Bearer ${FRIDAY_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      }),
    ]);
    if (!healthRes.ok) {
      await ctx.reply(`⚠️ orchestrator: HTTP ${healthRes.status}`);
      return;
    }
    const health = (await healthRes.json()) as { service?: string; version?: string };
    const tools = toolsRes.ok ? ((await toolsRes.json()) as { count?: number }) : { count: 0 };
    await ctx.reply(
      `✅ ${health.service ?? "orchestrator"} ${health.version ?? ""}\n` +
        `🔧 ${tools.count ?? 0} tools\n` +
        `💬 ${convLen} messages in this conversation\n` +
        `🔗 ${FRIDAY_URL}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ can't reach orchestrator: ${msg}`);
  }
});

bot.on(message("text"), async (ctx) => {
  const userId = ctx.from!.id;
  const text = ctx.message.text;

  await ctx.sendChatAction("typing");
  const typingInterval = setInterval(() => {
    ctx.sendChatAction("typing").catch(() => {});
  }, 4000);

  const result = await askFriday(userId, text);
  clearInterval(typingInterval);

  if (!result.ok) {
    console.error(`[telegram-bot] FRIDAY error: ${result.error}`);
    await ctx.reply(`⚠️ ${result.error.slice(0, 500)}`);
    return;
  }

  for (const chunk of splitForTelegram(result.text)) {
    await ctx.reply(chunk);
  }
});

bot.catch((err, ctx) => {
  console.error(`[telegram-bot] unhandled error from ${ctx.from?.id}:`, err);
});

bot
  .launch()
  .then(() => {
    console.log(`[telegram-bot] online — forwarding to ${FRIDAY_URL}, allowlist: [${ALLOWLIST.join(", ")}]`);
  })
  .catch((err) => {
    console.error("[telegram-bot] launch failed:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
