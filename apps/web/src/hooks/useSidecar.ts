"use client";

import { useState, useEffect, useCallback } from "react";

interface SidecarStatus {
  voice_mode: string;
  person_present: boolean;
  mess_level: number;
  consecutive_nags: number;
  total_nags_today: number;
  total_cleanups_today: number;
  last_analysis: Record<string, unknown>;
  daily_events: string[];
}

interface SidecarEvent {
  type: string;
  message: string;
  timestamp: string;
}

const SIDECAR_URL = "http://localhost:3002";

export function useSidecar() {
  const [status, setStatus] = useState<SidecarStatus | null>(null);
  const [events, setEvents] = useState<SidecarEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string>("");

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${SIDECAR_URL}/api/status`);
      if (resp.ok) {
        const data = await resp.json();
        setStatus(data);
        setConnected(true);
      } else {
        setConnected(false);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const resp = await fetch(`${SIDECAR_URL}/api/events`);
      if (resp.ok) {
        const data = await resp.json();
        setEvents(data.events || []);
      }
    } catch {
      // Sidecar offline
    }
  }, []);

  // Poll status every 3 seconds
  useEffect(() => {
    fetchStatus();
    fetchEvents();
    const interval = setInterval(() => {
      fetchStatus();
      fetchEvents();
      // Refresh frame URL with cache-busting timestamp
      setFrameUrl(`${SIDECAR_URL}/api/frame?t=${Date.now()}`);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchEvents]);

  return { status, events, connected, frameUrl };
}
