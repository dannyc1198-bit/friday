"use client";

import { useState, useEffect, useCallback } from "react";

export interface Insight {
  id: string;
  type: "optimization" | "alert" | "learning" | "suggestion" | "pattern";
  title: string;
  message: string;
  priority: "low" | "medium" | "high";
  timestamp: number;
  dismissed?: boolean;
}

export function useProactiveInsights(enabled: boolean) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [learningStats, setLearningStats] = useState<{
    totalInteractions: number;
    successRate: number;
    mostUsedTools: string[];
    peakHours: number[];
    topRequestCategories: string[];
  } | null>(null);

  const dismissInsight = useCallback((id: string) => {
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, dismissed: true } : i)));
  }, []);

  // Fetch learning stats and generate insights
  useEffect(() => {
    if (!enabled) return;

    async function fetchAndAnalyze() {
      try {
        // Fetch learning engine stats
        const statsRes = await fetch("http://localhost:3001/api/learning/stats");
        if (statsRes.ok) {
          const data = await statsRes.json();
          const stats = data.stats;
          setLearningStats(stats);

          const newInsights: Insight[] = [];

          // Success rate insight
          if (stats?.successRate !== undefined && stats.successRate < 0.7) {
            newInsights.push({
              id: `success-rate-${Date.now()}`,
              type: "optimization",
              title: "Success Rate Low",
              message: `Task success rate is ${(stats.successRate * 100).toFixed(0)}%. I'm analyzing failure patterns to improve.`,
              priority: "medium",
              timestamp: Date.now(),
            });
          }

          // Tool usage patterns
          if (stats?.mostUsedTools?.length > 0) {
            const topTool = stats.mostUsedTools[0];
            newInsights.push({
              id: `tool-pattern-${Date.now()}`,
              type: "pattern",
              title: "Usage Pattern Detected",
              message: `Your most-used tool is ${topTool}. I'm optimizing my responses around this workflow.`,
              priority: "low",
              timestamp: Date.now(),
            });
          }

          // Peak hour insight
          if (stats?.peakHours?.length > 0) {
            const peakHour = stats.peakHours[0];
            const now = new Date().getHours();
            if (Math.abs(now - peakHour) <= 1) {
              newInsights.push({
                id: `peak-hour-${Date.now()}`,
                type: "suggestion",
                title: "Peak Productivity Window",
                message: `This is your peak hour (${peakHour}:00). I'll queue non-urgent alerts and prioritize deep work.`,
                priority: "medium",
                timestamp: Date.now(),
              });
            }
          }

          // Milestone insight
          if (stats?.totalInteractions && stats.totalInteractions % 50 === 0) {
            newInsights.push({
              id: `milestone-${stats.totalInteractions}`,
              type: "learning",
              title: "Learning Milestone",
              message: `${stats.totalInteractions} interactions processed. My pattern recognition is improving with every conversation.`,
              priority: "low",
              timestamp: Date.now(),
            });
          }

          if (newInsights.length > 0) {
            setInsights((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const fresh = newInsights.filter((i) => !existingIds.has(i.id));
              return [...fresh, ...prev].slice(0, 10);
            });
          }
        }

        // Also check for proactive alerts
        const alertsRes = await fetch("http://localhost:3001/api/proactive/alerts");
        if (alertsRes.ok) {
          const data = await alertsRes.json();
          const alerts = data.alerts || [];
          const highPriority = alerts.filter((a: { priority: string }) => a.priority === "high");

          if (highPriority.length > 0) {
            const alertInsights: Insight[] = highPriority.map((a: { id: string; message: string }) => ({
              id: `proactive-${a.id}`,
              type: "alert" as const,
              title: "Proactive Alert",
              message: a.message,
              priority: "high" as const,
              timestamp: Date.now(),
            }));

            setInsights((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const fresh = alertInsights.filter((i: Insight) => !existingIds.has(i.id));
              return [...fresh, ...prev].slice(0, 10);
            });
          }
        }
      } catch {
        // Orchestrator offline — no insights available
      }
    }

    fetchAndAnalyze();
    const id = setInterval(fetchAndAnalyze, 60_000); // Every 60s
    return () => clearInterval(id);
  }, [enabled]);

  const activeInsights = insights.filter((i) => !i.dismissed);

  return { insights: activeInsights, learningStats, dismissInsight };
}
