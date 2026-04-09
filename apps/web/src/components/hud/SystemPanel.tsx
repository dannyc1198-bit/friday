"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick, Wifi, Thermometer } from "lucide-react";
import { DataWindow, ProgressBar } from "./DataWindow";

interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: "connected" | "disconnected";
  uptime: string;
  services: { name: string; status: "online" | "offline" | "warning" }[];
}

export function SystemPanel() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: "connected",
    uptime: "0h",
    services: [
      { name: "ORCHESTRATOR", status: "online" },
      { name: "SIDECAR", status: "online" },
      { name: "VOICE I/O", status: "online" },
      { name: "LLM ROUTER", status: "online" },
      { name: "VAULT", status: "online" },
      { name: "PROACTIVE", status: "online" },
    ],
  });

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          // Use real data when available, simulated for now
          setMetrics((prev) => ({
            ...prev,
            cpu: 12 + Math.random() * 20,
            memory: 45 + Math.random() * 15,
            disk: 67,
            uptime: formatUptime(Date.now()),
          }));
        }
      } catch {
        // Offline
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DataWindow
      title="System Vitals"
      icon={<Cpu className="w-4 h-4" />}
      status="online"
      compact
    >
      <div className="space-y-2.5">
        <ProgressBar value={metrics.cpu} max={100} label="CPU" color="cyan" />
        <ProgressBar value={metrics.memory} max={100} label="Memory" color="blue" />
        <ProgressBar value={metrics.disk} max={100} label="Disk" color={metrics.disk > 90 ? "red" : "green"} />

        <div className="border-t border-cyan-900/30 pt-2 mt-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-600 mb-1 block">
            Services
          </span>
          <div className="grid grid-cols-2 gap-1">
            {metrics.services.map((svc) => (
              <div key={svc.name} className="flex items-center gap-1.5">
                <div
                  className={`w-1 h-1 rounded-full ${
                    svc.status === "online"
                      ? "bg-emerald-400"
                      : svc.status === "warning"
                      ? "bg-amber-400"
                      : "bg-red-400"
                  }`}
                />
                <span className="text-[9px] font-mono text-cyan-500">{svc.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DataWindow>
  );
}

function formatUptime(startMs: number): string {
  const hours = Math.floor((Date.now() - startMs) / 3600000);
  return hours > 0 ? `${hours}h` : "<1h";
}
