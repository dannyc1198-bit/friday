/** Strip secrets before text is stored or spoken. Keys are never logged. */

const SECRET_LINE = /^([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Za-z0-9_]*)\s*=\s*\S+/gim;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const TOKEN = /\b(?:sk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,}|ghp_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|ya29\.[A-Za-z0-9._-]{8,})\b/g;
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._\-]{8,}/gi;

export function redactIngest(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  const next = text
    .replace(PRIVATE_KEY, () => {
      redacted = true;
      return "[redacted-key]";
    })
    .replace(TOKEN, () => {
      redacted = true;
      return "[redacted]";
    })
    .replace(BEARER, () => {
      redacted = true;
      return "Bearer [redacted]";
    })
    .replace(SECRET_LINE, (_match, name: string) => {
      redacted = true;
      return `${name}=[redacted]`;
    });
  return { text: next, redacted };
}

export function redactSecrets(message: string, secrets: Array<string | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret || secret.length < 6) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^(your_|changeme|todo|xxx|placeholder)/i.test(trimmed);
}
