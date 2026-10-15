// Strip credentials before a provider error or adapter body is logged or spoken.

export function redactSecrets(value: string): string {
  return (value || "")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "sk-…")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza…")
    .replace(/gsk_[a-zA-Z0-9_-]+/g, "gsk_…")
    .replace(/friday_[a-f0-9]{16,}/gi, "friday_…")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
    .replace(/Key\s+\S+/g, "Key …");
}
