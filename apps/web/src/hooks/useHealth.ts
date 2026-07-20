"use client";

import { useState, useEffect, useCallback } from "react";
import { ConnectionStatus, HealthResponse } from "@/types";
import { HEALTH_CHECK_INTERVAL } from "@/lib/constants";

// Polls the (now real) health proxy. Exposes the rich payload — llm
// provider/model, tool count, tts — so the StatusStrip can show truth
// instead of a decorative green dot.
export function useHealth() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (response.ok) {
        const data: HealthResponse = await response.json();
        setHealth(data);
        setStatus(data.ok ? "connected" : "disconnected");
      } else {
        setHealth(null);
        setStatus("disconnected");
      }
    } catch {
      setHealth(null);
      setStatus("disconnected");
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { status, health, lastChecked, checkHealth };
}
