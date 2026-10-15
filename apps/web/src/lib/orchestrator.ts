export function orchestratorAuth(extra: Record<string, string> = {}): HeadersInit {
  return {
    ...extra,
    Authorization: `Bearer ${process.env.FRIDAY_API_KEY || ""}`,
  };
}
