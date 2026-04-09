"use client";

import { BarChart3 } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Cell } from "recharts";
import { DataWindow, Stat } from "./DataWindow";

const weekData = [
  { day: "M", rev: 0 },
  { day: "T", rev: 45 },
  { day: "W", rev: 120 },
  { day: "T", rev: 0 },
  { day: "F", rev: 200 },
  { day: "S", rev: 0 },
  { day: "S", rev: 0 },
];

export function BusinessPanel() {
  return (
    <DataWindow
      title="Revenue Intel"
      icon={<BarChart3 className="w-4 h-4" />}
      status="online"
      compact
    >
      <div className="space-y-3">
        {/* Key metrics row */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="MRR" value="$0" />
          <Stat label="Leads" value="21" />
          <Stat label="Pipeline" value="$7.5K" />
        </div>

        {/* Weekly revenue chart */}
        <div>
          <span className="text-[9px] font-mono uppercase tracking-wider text-cyan-600 block mb-1">
            This Week
          </span>
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} barSize={8}>
                <Bar dataKey="rev" radius={[2, 2, 0, 0]}>
                  {weekData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rev > 0 ? "#22d3ee" : "#164e63"}
                      fillOpacity={entry.rev > 0 ? 0.8 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily target */}
        <div className="flex items-center justify-between border-t border-cyan-900/30 pt-2">
          <span className="text-[9px] font-mono uppercase text-cyan-600">Daily Target</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-mono font-bold text-amber-400">$0</span>
            <span className="text-[9px] text-cyan-700">/ $500</span>
          </div>
        </div>
      </div>
    </DataWindow>
  );
}
