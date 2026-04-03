"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { VoicePack, getVoicePack, getDefaultVoicePack, voicePackThemes } from "@/config/voice-packs";

interface VoicePackContextType {
  currentPack: VoicePack;
  setVoicePack: (id: string) => void;
  theme: { primary: string; secondary: string; glow: string };
  playSound: (soundType: keyof VoicePack["sounds"]) => void;
}

const VoicePackContext = createContext<VoicePackContextType | undefined>(undefined);

export function VoicePackProvider({ children }: { children: ReactNode }) {
  const [currentPack, setCurrentPack] = useState<VoicePack>(getDefaultVoicePack());
  const [audioElements, setAudioElements] = useState<Map<string, HTMLAudioElement>>(new Map());

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem("JARVIS-voice-pack");
    if (saved) {
      const pack = getVoicePack(saved);
      if (pack) setCurrentPack(pack);
    }
  }, []);

  // Preload audio when pack changes
  useEffect(() => {
    const newAudioElements = new Map<string, HTMLAudioElement>();

    Object.entries(currentPack.sounds).forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      newAudioElements.set(key, audio);
    });

    setAudioElements(newAudioElements);

    return () => {
      newAudioElements.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
    };
  }, [currentPack]);

  const setVoicePack = (id: string) => {
    const pack = getVoicePack(id);
    if (pack) {
      setCurrentPack(pack);
      localStorage.setItem("JARVIS-voice-pack", id);
    }
  };

  const playSound = (soundType: keyof VoicePack["sounds"]) => {
    const audio = audioElements.get(soundType);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay restrictions
      });
    }
  };

  const theme = voicePackThemes[currentPack.accentColor] || voicePackThemes.cyan;

  return (
    <VoicePackContext.Provider value={{ currentPack, setVoicePack, theme, playSound }}>
      {children}
    </VoicePackContext.Provider>
  );
}

export function useVoicePack() {
  const context = useContext(VoicePackContext);
  if (!context) {
    throw new Error("useVoicePack must be used within VoicePackProvider");
  }
  return context;
}
