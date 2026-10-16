"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ActivityPoint } from "@/lib/console";

export default function ActivityChart({ points }: { points: ActivityPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: "rgb(var(--c-faint))", fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
          <YAxis allowDecimals={false} width={28} tick={{ fill: "rgb(var(--c-faint))", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "rgb(var(--c-panel))",
              border: "1px solid rgb(var(--c-line))",
              borderRadius: 8,
              color: "rgb(var(--c-ink))",
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="count" name="Events" stroke="rgb(var(--c-accent))" fill="rgb(var(--c-accent) / 0.16)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
