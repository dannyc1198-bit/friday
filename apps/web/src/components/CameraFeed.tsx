"use client";

import { useState } from "react";

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

  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
          <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Camera Feed</span>
        </div>
        {person && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Person Detected</span>}
      </div>

      <div className="relative aspect-video bg-black">
        {connected && frameUrl && !imgError ? (
          <img
            src={frameUrl}
            alt="FRIDAY Camera"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            onLoad={() => setImgError(false)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm font-mono">
            {connected ? "Waiting for frame..." : "SIDECAR OFFLINE"}
          </div>
        )}

        {/* Overlay: mess level indicator */}
        {messLevel > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2">
            <div className={`px-2 py-1 rounded text-xs font-bold ${
              messLevel >= 7 ? "bg-red-500/80 text-white" :
              messLevel >= 4 ? "bg-yellow-500/80 text-black" :
              "bg-green-500/80 text-white"
            }`}>
              MESS: {messLevel}/10
            </div>
          </div>
        )}
      </div>

      {observation && (
        <div className="px-3 py-2 text-xs text-gray-400 font-mono truncate">
          {observation}
        </div>
      )}
    </div>
  );
}
