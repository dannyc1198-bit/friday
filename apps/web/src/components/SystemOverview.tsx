"use client";

interface SystemOverviewProps {
  orchestratorStatus: string;
  sidecarConnected: boolean;
  voiceMode: string;
  toolCount?: number;
}

export function SystemOverview({
  orchestratorStatus,
  sidecarConnected,
  voiceMode,
  toolCount,
}: SystemOverviewProps) {
  const systems = [
    { name: "Orchestrator", status: orchestratorStatus === "connected" ? "online" : "offline", detail: toolCount ? `${toolCount} tools` : "" },
    { name: "Sidecar", status: sidecarConnected ? "online" : "offline", detail: "Camera + Voice" },
    { name: "Voice", status: voiceMode === "sleeping" ? "standby" : voiceMode === "conversation" ? "active" : "off", detail: voiceMode },
    { name: "OpenClaw", status: "standby", detail: "5 Agents" },
  ];

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50">
      <div className="px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">System</span>
      </div>
      <div className="p-2 space-y-1">
        {systems.map((sys) => (
          <div key={sys.name} className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                sys.status === "online" || sys.status === "active" ? "bg-green-400" :
                sys.status === "standby" ? "bg-yellow-400" :
                "bg-red-400"
              }`} />
              <span className="text-xs text-gray-300">{sys.name}</span>
            </div>
            <span className="text-[10px] text-gray-500">{sys.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
