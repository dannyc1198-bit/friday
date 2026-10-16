// Stop one conversation. An empty body must not cancel every active run.

export function stopTargets(
  conversationId: string | undefined,
  activeIds: readonly string[]
): { ids: string[]; error?: string } {
  const id = (conversationId || "").trim();
  if (!id) {
    return { ids: [], error: "conversationId is required. Nothing was cancelled." };
  }
  if (!activeIds.includes(id)) {
    return { ids: [], error: `No active run for ${id}.` };
  }
  return { ids: [id] };
}
