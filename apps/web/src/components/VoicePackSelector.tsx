"use client";

import { voicePacks, voicePackThemes } from "@/config/voice-packs";
import { useVoicePack } from "@/contexts/VoicePackContext";

export function VoicePackSelector() {
  const { currentPack, setVoicePack, playSound } = useVoicePack();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-white mb-4">Select AI Voice Pack</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {voicePacks.map((pack) => {
          const theme = voicePackThemes[pack.accentColor];
          const isSelected = currentPack.id === pack.id;

          return (
            <button
              key={pack.id}
              onClick={() => {
                setVoicePack(pack.id);
                playSound("notification");
              }}
              className={`relative p-4 rounded-lg border-2 transition-all duration-300 text-left ${
                isSelected
                  ? "border-opacity-100 scale-105"
                  : "border-opacity-30 hover:border-opacity-60 hover:scale-102"
              }`}
              style={{
                borderColor: theme.primary,
                backgroundColor: isSelected ? `${theme.primary}20` : "rgba(0,0,0,0.5)",
                boxShadow: isSelected ? `0 0 20px ${theme.glow}` : "none",
              }}
            >
              {/* Selection indicator */}
              {isSelected && (
                <div
                  className="absolute top-2 right-2 w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: theme.primary }}
                />
              )}

              {/* Pack info */}
              <h3
                className="font-bold text-lg mb-1"
                style={{ color: theme.primary }}
              >
                {pack.name}
              </h3>
              <p className="text-gray-400 text-sm mb-2">{pack.description}</p>
              <p className="text-gray-500 text-xs">{pack.movie}</p>

              {/* Personality preview */}
              <div className="mt-3 pt-3 border-t border-gray-700">
                <p className="text-gray-300 text-xs italic">
                  &ldquo;{pack.greeting.slice(0, 60)}...&rdquo;
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
