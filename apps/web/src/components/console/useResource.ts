"use client";

import { useCallback, useEffect, useState } from "react";
import { readDemo, useDemo } from "@/components/deck/demo";

export function useResource<T>(path: string, demoData: T) {
  const { demo } = useDemo();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (readDemo()) {
      setData(demoData);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(path, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = body && typeof body === "object" && "error" in body ? String((body as { error?: unknown }).error || "") : "";
        throw new Error(message || "The service did not answer.");
      }
      setData(body as T);
      setError("");
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "The service did not answer.");
    } finally {
      setLoading(false);
    }
  }, [demo, demoData, path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, demo };
}
