"use client";

import { useState, useEffect, useCallback } from "react";
import { ConnectionStatus, HealthResponse } from "@/types";
import { HEALTH_CHECK_INTERVAL } from "@/lib/constants";

export function useHealth() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      if (response.ok) {
        const data: HealthResponse = await response.json();
        if (data.ok) {
          setStatus("connected");
        } else {
          setStatus("disconnected");
        }
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("disconnected");
    }
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { status, lastChecked, checkHealth };
}
