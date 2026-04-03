"use client";

import { useState } from "react";
import { VoiceConfig as VoiceConfigType } from "@/types";
import { cn } from "@/lib/utils";

// Available voice options for future TTS integration
const VOICE_OPTIONS = [
  { id: "JARVIS-british", name: "JARVIS (British)", description: "Classic British butler AI voice" },
  { id: "JARVIS-american", name: "JARVIS (American)", description: "American variant" },
  { id: "friday", name: "F.R.I.D.A.Y.", description: "Irish female assistant" },
  { id: "custom", name: "Custom", description: "Configure your own voice" },
];

interface VoiceConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VoiceConfigPanel({ isOpen, onClose }: VoiceConfigPanelProps) {
  const [config, setConfig] = useState<VoiceConfigType>({
    enabled: true,
    voice: "JARVIS-british",
    speed: 1.0,
    pitch: 1.0,
    volume: 0.8,
  });

  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [wakeWord, setWakeWord] = useState("Hey JARVIS");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-purple-900/20 to-transparent">
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Voice Settings
            </h2>
            <p className="text-sm text-text-muted">Configure voice input and output</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Voice Enabled Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border">
            <div>
              <h3 className="font-medium text-text-primary">Voice Output</h3>
              <p className="text-sm text-text-muted">Enable text-to-speech responses</p>
            </div>
            <button
              onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={cn(
                "relative w-14 h-8 rounded-full transition-colors",
                config.enabled ? "bg-primary" : "bg-white/10"
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                  config.enabled ? "left-7" : "left-1"
                )}
              />
            </button>
          </div>

          {/* Voice Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary">Voice Type</label>
            <div className="grid grid-cols-2 gap-3">
              {VOICE_OPTIONS.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setConfig((prev) => ({ ...prev, voice: voice.id }))}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all",
                    config.voice === voice.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <h4 className="font-medium text-text-primary text-sm">{voice.name}</h4>
                  <p className="text-xs text-text-muted mt-1">{voice.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Voice Parameters */}
          <div className="space-y-4">
            {/* Speed */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Speed</span>
                <span className="text-text-primary">{config.speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={config.speed}
                onChange={(e) => setConfig((prev) => ({ ...prev, speed: parseFloat(e.target.value) }))}
                className="w-full h-2 rounded-full appearance-none bg-white/10 accent-primary"
              />
            </div>

            {/* Pitch */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Pitch</span>
                <span className="text-text-primary">{config.pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={config.pitch}
                onChange={(e) => setConfig((prev) => ({ ...prev, pitch: parseFloat(e.target.value) }))}
                className="w-full h-2 rounded-full appearance-none bg-white/10 accent-primary"
              />
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Volume</span>
                <span className="text-text-primary">{Math.round(config.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.volume}
                onChange={(e) => setConfig((prev) => ({ ...prev, volume: parseFloat(e.target.value) }))}
                className="w-full h-2 rounded-full appearance-none bg-white/10 accent-primary"
              />
            </div>
          </div>

          {/* Wake Word */}
          <div className="space-y-3 p-4 rounded-xl bg-background border border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-text-primary">Wake Word</h3>
                <p className="text-sm text-text-muted">Say this to activate voice input</p>
              </div>
              <button
                onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  wakeWordEnabled ? "bg-primary" : "bg-white/10"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    wakeWordEnabled ? "left-6" : "left-0.5"
                  )}
                />
              </button>
            </div>
            {wakeWordEnabled && (
              <input
                type="text"
                value={wakeWord}
                onChange={(e) => setWakeWord(e.target.value)}
                placeholder="Hey JARVIS"
                className="w-full px-4 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            )}
          </div>

          {/* Test Voice Button */}
          <button
            className="w-full py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-2"
            onClick={() => {
              // Placeholder for TTS test
              alert("Voice preview will be available in Milestone 4 when TTS is integrated.");
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Test Voice
          </button>

          {/* Coming Soon Notice */}
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-400 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Voice features coming in Milestone 4. Settings saved for later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
