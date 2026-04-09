"use client";

import { Bell, AlertTriangle, Info, Zap } from "lucide-react";
import { DataWindow } from "./DataWindow";

interface Alert {
  id: string;
  type: "info" | "warning" | "critical";
  message: string;
  time: string;
}

const iconMap = {
  info: <Info className="w-3 h-3 text-cyan-400" />,
  warning: <AlertTriangle className="w-3 h-3 text-amber-400" />,
  critical: <Zap className="w-3 h-3 text-red-400" />,
};

const borderMap = {
  info: "border-l-cyan-500/50",
  warning: "border-l-amber-500/50",
  critical: "border-l-red-500/50",
};

export function AlertsPanel({ alerts = [] }: { alerts?: Alert[] }) {
  const displayAlerts =
    alerts.length > 0
      ? alerts
      : [
          { id: "1", type: "info" as const, message: "FRIDAY online. All systems nominal.", time: "now" },
          { id: "2", type: "info" as const, message: "Morning briefing ready.", time: "5m" },
        ];

  return (
    <DataWindow
      title="Activity Feed"
      icon={<Bell className="w-4 h-4" />}
      status="online"
      compact
    >
      <div className="space-y-1">
        {displayAlerts.slice(0, 5).map((alert) => (
          <div
            key={alert.id}
            className={`flex items-start gap-2 px-2 py-1.5 rounded-sm bg-cyan-950/20 border-l-2 ${borderMap[alert.type]}`}
          >
            <span className="mt-0.5 shrink-0">{iconMap[alert.type]}</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono text-cyan-300 block leading-tight">
                {alert.message}
              </span>
            </div>
            <span className="text-[8px] font-mono text-cyan-700 shrink-0">{alert.time}</span>
          </div>
        ))}
      </div>
    </DataWindow>
  );
}
