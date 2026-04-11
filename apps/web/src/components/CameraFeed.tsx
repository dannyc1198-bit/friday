"use client";

import { useState } from "react";
import { DataWindow } from "./hud/DataWindow";
import { Camera, User, AlertTriangle } from "lucide-react";

interface CameraFeedProps {
  frameUrl: string;
  connected: boolean;
  analysis?: Record<string, unknown>;
}

export function CameraFeed({ frameUrl, connected, analysis }: CameraFeedProps) {
  const [imgError, setImgError] = useState(false);

  const messLevel = (analysis?.mess_level as number) || 0;
  const person = analysis?.person_detected as boolean;
  const observation = analysis?.general_observation as string;
  const securityConcern = analysis?.security_concern as string;

  const messColor = messLevel >= 7 ? "#ff5252" : messLevel >= 4 ? "#ffa726" : "#66ffb2";

  return (
    <DataWindow
      title="Vision Feed"
      icon={<Camera className="w-4 h-4" />}
      status={connected ? "online" : "offline"}
      compact
    >
      {/* Camera viewport */}
      <div className="relative aspect-video rounded overflow-hidden bg-[#020a14] border border-[rgba(0,180,255,0.06)]">
        {connected && frameUrl && !imgError ? (
          <img
            src={frameUrl}
            alt="FRIDAY Vision"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            onLoad={() => setImgError(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Camera className="w-6 h-6 text-[#1e3a50]" />
            <span className="text-[10px] font-mono text-[#1e3a50] uppercase tracking-[0.2em]">
              {connected ? "Awaiting frame..." : "Sidecar Offline"}
            </span>
          </div>
        )}

        {/* Scanline overlay on feed */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,180,255,0.02) 2px, rgba(0,180,255,0.02) 4px)" }}
        />

        {/* Corner brackets on feed */}
        <div className="absolute top-1 left-1 w-4 h-4 border-l border-t border-[#00b4ff]/30" />
        <div className="absolute top-1 right-1 w-4 h-4 border-r border-t border-[#00b4ff]/30" />
        <div className="absolute bottom-1 left-1 w-4 h-4 border-l border-b border-[#00b4ff]/30" />
        <div className="absolute bottom-1 right-1 w-4 h-4 border-r border-b border-[#00b4ff]/30" />

        {/* Person detected badge */}
        {person && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-[#00b4ff]/20 border border-[#00b4ff]/30 backdrop-blur-sm">
            <User className="w-3 h-3 text-[#00dcff]" />
            <span className="text-[8px] font-mono text-[#00dcff] uppercase tracking-wider">Detected</span>
          </div>
        )}

        {/* Mess level overlay */}
        {messLevel > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2">
            <div
              className="px-2 py-1 rounded text-[9px] font-mono font-bold backdrop-blur-sm border"
              style={{
                backgroundColor: `${messColor}15`,
                borderColor: `${messColor}40`,
                color: messColor,
              }}
            >
              MESS {messLevel}/10
            </div>
          </div>
        )}

        {/* Security concern */}
        {securityConcern && securityConcern !== "none" && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-[#ff5252]/15 border border-[#ff5252]/30 backdrop-blur-sm">
            <AlertTriangle className="w-3 h-3 text-[#ff5252]" />
            <span className="text-[8px] font-mono text-[#ff5252] uppercase">Alert</span>
          </div>
        )}

        {/* REC indicator */}
        {connected && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#ff5252] animate-pulse" />
            <span className="text-[8px] font-mono text-[#ff5252]/70 uppercase">REC</span>
          </div>
        )}
      </div>

      {/* Observation text */}
      {observation && (
        <div className="mt-2 px-1">
          <span className="text-[9px] font-mono text-[#5a8aaa] leading-relaxed line-clamp-2">
            {observation}
          </span>
        </div>
      )}
    </DataWindow>
  );
}
