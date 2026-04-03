"use client";

import { ConnectionStatus } from "@/types";
import { cn } from "@/lib/utils";

interface StatusChipProps {
  status: ConnectionStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  const statusConfig = {
    connected: {
      color: "bg-success",
      text: "Connected",
    },
    disconnected: {
      color: "bg-error",
      text: "Disconnected",
    },
    checking: {
      color: "bg-yellow-500",
      text: "Checking...",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border">
      <div className={cn("w-2 h-2 rounded-full", config.color)} />
      <span className="text-xs text-text-secondary">{config.text}</span>
    </div>
  );
}
