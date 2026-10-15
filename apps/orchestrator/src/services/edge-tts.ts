// Free JARVIS-style speech via Microsoft Edge neural voices.
// en-GB-RyanNeural is a calm British male — delivery is slowed and lowered
// with SSML. This is not a clip of any film performance.
//
// Protocol follows the public edge-tts client (MIT): a short-lived websocket
// to the Read Aloud endpoint. Failure returns null so the browser can speak.

import { createHash, randomUUID } from "crypto";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const WIN_EPOCH = 11644473600;

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Measured British butler delivery: slightly slower, slightly lower. */
export function buildJarvisSsml(text: string, voice: string): string {
  const safeVoice = escapeSsml(voice);
  const safeText = escapeSsml(text);
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">` +
    `<voice name="${safeVoice}">` +
    `<prosody rate="-8%" pitch="-6%">${safeText}</prosody>` +
    `</voice></speak>`
  );
}

function secMsGecToken(): string {
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;
  return createHash("sha256").update(`${ticks}${TRUSTED_CLIENT_TOKEN}`).digest("hex").toUpperCase();
}

function edgeTimestamp(): string {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function endpointUrl(connectionId: string): string {
  const params = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    "Sec-MS-GEC": secMsGecToken(),
    "Sec-MS-GEC-Version": `1-${CHROMIUM_FULL_VERSION}`,
    ConnectionId: connectionId,
  });
  return `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?${params}`;
}

/**
 * Synthesize MP3 bytes. Returns null on any failure (network, timeout, empty).
 * Never throws.
 */
export function synthesizeEdge(text: string, voice: string, timeoutMs = 15_000): Promise<Buffer | null> {
  const cleaned = text.trim();
  if (cleaned.length < 2) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (audio: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(audio);
    };

    const connectionId = randomUUID().replace(/-/g, "");
    const requestId = randomUUID().replace(/-/g, "");
    let socket: WebSocket;
    try {
      socket = new WebSocket(endpointUrl(connectionId), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      console.error("[TTS] Edge socket failed to open:", (err as Error).message);
      resolve(null);
      return;
    }

    const timer = setTimeout(() => finish(null), timeoutMs);
    const chunks: Buffer[] = [];

    socket.on("error", (err) => {
      console.error("[TTS] Edge voice error:", err.message);
      finish(chunks.length ? Buffer.concat(chunks) : null);
    });

    socket.on("open", () => {
      const config =
        `X-Timestamp:${edgeTimestamp()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      const ssml =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${edgeTimestamp()}\r\n` +
        `Path:ssml\r\n\r\n` +
        buildJarvisSsml(cleaned, voice);
      socket.send(config);
      socket.send(ssml);
    });

    socket.on("message", (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      const headerEnd = buf.indexOf("\r\n\r\n");
      const header = (headerEnd === -1 ? buf : buf.subarray(0, headerEnd)).toString("utf8");
      const body = headerEnd === -1 ? Buffer.alloc(0) : buf.subarray(headerEnd + 4);
      if (header.includes("Path:turn.end")) {
        finish(chunks.length ? Buffer.concat(chunks) : null);
        return;
      }
      if (header.includes("Path:audio") && body.length > 0) {
        chunks.push(body);
      } else if (isBinary && body.length > 0 && header.includes("Path:audio")) {
        chunks.push(body);
      }
    });

    socket.on("close", () => {
      finish(chunks.length ? Buffer.concat(chunks) : null);
    });
  });
}
