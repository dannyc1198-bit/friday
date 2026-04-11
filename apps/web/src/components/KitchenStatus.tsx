"use client";

import { motion } from "framer-motion";
import { ChefHat, AlertTriangle, Sparkles, Timer } from "lucide-react";
import { DataWindow } from "./hud/DataWindow";

interface KitchenStatusProps {
  messLevel: number;
  consecutiveNags: number;
  totalNagsToday: number;
  totalCleanupsToday: number;
  dailyEvents: string[];
}

const ESCALATION_LABELS = ["Gentle", "Firm", "Stern", "Drill Sergeant"];
const ESCALATION_COLORS = ["#66ffb2", "#ffa726", "#ff5252", "#ff1744"];

export function KitchenStatus({
  messLevel,
  consecutiveNags,
  totalNagsToday,
  totalCleanupsToday,
  dailyEvents,
}: KitchenStatusProps) {
  const escIdx = Math.min(consecutiveNags, ESCALATION_LABELS.length - 1);
  const escalationLevel = ESCALATION_LABELS[escIdx];
  const escColor = ESCALATION_COLORS[escIdx];
  const messColor = messLevel >= 7 ? "#ff5252" : messLevel >= 4 ? "#ffa726" : "#66ffb2";
  const barWidth = Math.min(messLevel * 10, 100);

  return (
    <DataWindow
      title="Kitchen Nagger"
      icon={<ChefHat className="w-4 h-4" />}
      status={messLevel >= 7 ? "warning" : "online"}
      compact
    >
      <motion.div
        className="space-y-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Mess Level Bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#5a8aaa]">Mess Level</span>
            <span className="text-sm font-mono font-bold" style={{ color: messColor }}>
              {messLevel}<span className="text-[9px] text-[#5a8aaa]">/10</span>
            </span>
          </div>
          <div className="h-2 bg-[#0a1a2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor: messColor,
                boxShadow: `0 0 8px ${messColor}40`,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${barWidth}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-1.5">
          <motion.div
            className="rounded bg-[#0a1a2e]/60 px-2 py-1.5 border border-[rgba(0,180,255,0.06)] text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <AlertTriangle className="w-2.5 h-2.5 text-[#ffa726]" />
            </div>
            <span className="text-sm font-mono font-bold text-[#ffa726]">{totalNagsToday}</span>
            <span className="text-[7px] font-mono text-[#5a8aaa] block uppercase">Nags</span>
          </motion.div>

          <motion.div
            className="rounded bg-[#0a1a2e]/60 px-2 py-1.5 border border-[rgba(0,180,255,0.06)] text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Sparkles className="w-2.5 h-2.5 text-[#66ffb2]" />
            </div>
            <span className="text-sm font-mono font-bold text-[#66ffb2]">{totalCleanupsToday}</span>
            <span className="text-[7px] font-mono text-[#5a8aaa] block uppercase">Cleans</span>
          </motion.div>

          <motion.div
            className="rounded bg-[#0a1a2e]/60 px-2 py-1.5 border border-[rgba(0,180,255,0.06)] text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Timer className="w-2.5 h-2.5" style={{ color: escColor }} />
            </div>
            <span className="text-[9px] font-mono font-bold" style={{ color: escColor }}>
              {escalationLevel}
            </span>
            <span className="text-[7px] font-mono text-[#5a8aaa] block uppercase">Tone</span>
          </motion.div>
        </div>

        {/* Recent Events */}
        {dailyEvents.length > 0 && (
          <div className="border-t border-[rgba(0,180,255,0.05)] pt-2">
            <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-[#1e3a50] block mb-1">
              Today&apos;s Events
            </span>
            <div className="space-y-0.5 max-h-20 overflow-y-auto scrollbar-thin">
              {dailyEvents.slice(-5).reverse().map((event, i) => (
                <motion.div
                  key={i}
                  className="text-[9px] font-mono text-[#5a8aaa] truncate"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  {event}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </DataWindow>
  );
}
