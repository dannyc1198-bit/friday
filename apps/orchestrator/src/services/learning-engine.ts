// Learning Engine — Progressive self-improvement for FRIDAY
//
// This is the brain's growth mechanism. FRIDAY learns from:
//   1. Outcomes: Did the advice/action work? Track success/failure.
//   2. Patterns: What does Danny ask for, when, and how?
//   3. Preferences: How Danny likes things done (style, detail level, etc.)
//   4. Strategies: Which approaches work best for which situations?
//
// The engine feeds into the system prompt via context injection,
// making every conversation slightly smarter than the last.
//
// NO external ML dependencies. Pure structured tracking + heuristics.
// The intelligence comes from pattern recognition over accumulated data.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { unifiedMemory } from "./unified-memory.js";
import { DATA_DIR } from "./runtime-paths.js";

// ─── Paths ──────────────────────────────────────────────────────
const LEARNING_FILE = `${DATA_DIR}/learning-engine.json`;

// ─── Types ──────────────────────────────────────────────────────

export interface OutcomeRecord {
  id: string;
  action: string;           // What FRIDAY did
  context: string;          // What prompted it
  toolsUsed: string[];      // Which tools were invoked
  agentUsed?: string;       // Which specialist agent (if dispatched)
  outcome: "success" | "failure" | "partial" | "unknown";
  feedback?: string;        // Danny's explicit feedback
  timestamp: string;
  duration?: number;        // How long the task took (ms)
}

export interface PatternRecord {
  id: string;
  pattern: string;          // Description of the pattern
  category: "timing" | "request_type" | "tool_usage" | "preference" | "workflow";
  frequency: number;        // How many times observed
  confidence: number;       // 0-1
  firstSeen: string;
  lastSeen: string;
  examples: string[];       // Up to 5 example instances
}

export interface StrategyRecord {
  id: string;
  domain: string;           // sales, coding, content, health, productivity
  strategy: string;         // What approach to use
  successRate: number;      // 0-1 based on outcomes
  timesUsed: number;
  lastUsed: string;
  alternatives: string[];   // Other strategies tried
}

export interface LearningStore {
  version: number;
  outcomes: OutcomeRecord[];
  patterns: PatternRecord[];
  strategies: StrategyRecord[];
  sessionStats: {
    totalInteractions: number;
    totalToolCalls: number;
    successRate: number;
    mostUsedTools: Record<string, number>;
    peakHours: Record<string, number>;       // hour → count
    topRequestCategories: Record<string, number>;
  };
  lastLearningCycle: string;
}

// ─── Learning Engine ────────────────────────────────────────────

class LearningEngine {
  private store: LearningStore;

  constructor() {
    this.store = this.loadStore();
  }

  // ─── Outcome Tracking ───────────────────────────────────────

  /** Record the outcome of a FRIDAY action */
  recordOutcome(params: {
    action: string;
    context: string;
    toolsUsed: string[];
    agentUsed?: string;
    outcome: OutcomeRecord["outcome"];
    feedback?: string;
    duration?: number;
  }): string {
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const record: OutcomeRecord = {
      id,
      ...params,
      timestamp: new Date().toISOString(),
    };

    this.store.outcomes.push(record);

    // Keep last 500 outcomes
    if (this.store.outcomes.length > 500) {
      this.store.outcomes = this.store.outcomes.slice(-500);
    }

    // Update session stats
    this.store.sessionStats.totalInteractions++;
    this.store.sessionStats.totalToolCalls += params.toolsUsed.length;
    for (const tool of params.toolsUsed) {
      this.store.sessionStats.mostUsedTools[tool] =
        (this.store.sessionStats.mostUsedTools[tool] || 0) + 1;
    }

    // Update success rate
    const recent = this.store.outcomes.slice(-100);
    const successes = recent.filter(o => o.outcome === "success").length;
    this.store.sessionStats.successRate = successes / recent.length;

    // Track peak hours
    const hour = new Date().getHours().toString();
    this.store.sessionStats.peakHours[hour] =
      (this.store.sessionStats.peakHours[hour] || 0) + 1;

    // Store in unified memory if notable
    if (params.outcome === "failure" || params.feedback) {
      unifiedMemory.store_entry({
        source: "learning",
        category: "outcome",
        content: `${params.outcome}: ${params.action}${params.feedback ? ` — Feedback: ${params.feedback}` : ""}`,
        tags: ["outcome", params.outcome, ...params.toolsUsed],
        importance: params.outcome === "failure" ? "high" : "medium",
        confidence: 1.0,
      });
    }

    this.save();
    this.detectPatterns();
    return id;
  }

  // ─── Pattern Detection ──────────────────────────────────────

  /** Analyze recent interactions for emerging patterns */
  detectPatterns(): void {
    const now = new Date();
    const recentOutcomes = this.store.outcomes.filter(o => {
      const age = now.getTime() - new Date(o.timestamp).getTime();
      return age < 7 * 24 * 60 * 60 * 1000; // Last 7 days
    });

    if (recentOutcomes.length < 5) return; // Not enough data

    // Detect tool usage patterns
    const toolFreq: Record<string, number> = {};
    for (const outcome of recentOutcomes) {
      for (const tool of outcome.toolsUsed) {
        toolFreq[tool] = (toolFreq[tool] || 0) + 1;
      }
    }

    const topTools = Object.entries(toolFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    for (const [tool, count] of topTools) {
      if (count >= 3) {
        this.addOrUpdatePattern({
          pattern: `Frequently uses ${tool} tool (${count}x this week)`,
          category: "tool_usage",
          example: recentOutcomes.find(o => o.toolsUsed.includes(tool))?.context || "",
        });
      }
    }

    // Detect timing patterns
    const hourCounts: Record<number, number> = {};
    for (const outcome of recentOutcomes) {
      const hour = new Date(outcome.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const peakHour = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0];

    if (peakHour && parseInt(peakHour[0]) && peakHour[1] >= 3) {
      const h = parseInt(peakHour[0]);
      const period = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      this.addOrUpdatePattern({
        pattern: `Most active in the ${period} (around ${h}:00)`,
        category: "timing",
        example: `${peakHour[1]} interactions this week at ${h}:00`,
      });
    }

    // Detect failure patterns (repeated failures on same tool)
    const failures = recentOutcomes.filter(o => o.outcome === "failure");
    const failTools: Record<string, number> = {};
    for (const f of failures) {
      for (const tool of f.toolsUsed) {
        failTools[tool] = (failTools[tool] || 0) + 1;
      }
    }

    for (const [tool, count] of Object.entries(failTools)) {
      if (count >= 2) {
        this.addOrUpdatePattern({
          pattern: `${tool} has been failing frequently (${count} failures this week)`,
          category: "tool_usage",
          example: failures.find(f => f.toolsUsed.includes(tool))?.context || "",
        });
      }
    }

    // Detect request category patterns
    const categories: Record<string, number> = {};
    for (const outcome of recentOutcomes) {
      // Infer category from context keywords
      const lower = outcome.context.toLowerCase();
      if (lower.includes("music") || lower.includes("spotify")) categories.music = (categories.music || 0) + 1;
      if (lower.includes("light") || lower.includes("hue")) categories.smart_home = (categories.smart_home || 0) + 1;
      if (lower.includes("code") || lower.includes("build")) categories.development = (categories.development || 0) + 1;
      if (lower.includes("email") || lower.includes("outreach")) categories.business = (categories.business || 0) + 1;
      if (lower.includes("search") || lower.includes("find")) categories.research = (categories.research || 0) + 1;
    }

    this.store.sessionStats.topRequestCategories = categories;
    this.save();
  }

  // ─── Strategy Management ────────────────────────────────────

  /** Record or update a strategy based on outcomes */
  updateStrategy(domain: string, strategy: string, success: boolean): void {
    const existing = this.store.strategies.find(
      s => s.domain === domain && s.strategy === strategy
    );

    if (existing) {
      existing.timesUsed++;
      existing.lastUsed = new Date().toISOString();
      // Exponential moving average for success rate
      const alpha = 0.3;
      existing.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * existing.successRate;
    } else {
      this.store.strategies.push({
        id: `str_${Date.now()}`,
        domain,
        strategy,
        successRate: success ? 1.0 : 0.0,
        timesUsed: 1,
        lastUsed: new Date().toISOString(),
        alternatives: [],
      });
    }

    this.save();
  }

  /** Get the best strategy for a given domain */
  getBestStrategy(domain: string): StrategyRecord | null {
    const strategies = this.store.strategies
      .filter(s => s.domain === domain && s.timesUsed >= 2)
      .sort((a, b) => b.successRate - a.successRate);

    return strategies[0] || null;
  }

  // ─── Context Generation (feeds into LLM prompt) ─────────────

  /** Generate learning context for injection into the system prompt */
  buildLearningContext(): string {
    const parts: string[] = [];

    // Top patterns (most confident)
    const topPatterns = this.store.patterns
      .filter(p => p.confidence > 0.6)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    if (topPatterns.length > 0) {
      parts.push("LEARNED PATTERNS:");
      for (const p of topPatterns) {
        parts.push(`- ${p.pattern} (observed ${p.frequency}x, confidence ${(p.confidence * 100).toFixed(0)}%)`);
      }
    }

    // Best strategies
    const topStrategies = this.store.strategies
      .filter(s => s.successRate > 0.6 && s.timesUsed >= 3)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 3);

    if (topStrategies.length > 0) {
      parts.push("\nPROVEN STRATEGIES:");
      for (const s of topStrategies) {
        parts.push(`- [${s.domain}] ${s.strategy} (${(s.successRate * 100).toFixed(0)}% success, used ${s.timesUsed}x)`);
      }
    }

    // Recent failure warnings
    const recentFailures = this.store.outcomes
      .filter(o => o.outcome === "failure")
      .slice(-3);

    if (recentFailures.length > 0) {
      parts.push("\nRECENT ISSUES (avoid repeating):");
      for (const f of recentFailures) {
        parts.push(`- ${f.action}: ${f.feedback || "failed"}`);
      }
    }

    // Session stats summary
    if (this.store.sessionStats.totalInteractions > 10) {
      parts.push(`\nSESSION INTELLIGENCE: ${this.store.sessionStats.totalInteractions} total interactions, ${(this.store.sessionStats.successRate * 100).toFixed(0)}% success rate`);
    }

    return parts.length > 0 ? "\n\n" + parts.join("\n") : "";
  }

  // ─── Feedback Processing ────────────────────────────────────

  /** Process explicit feedback from Danny */
  processFeedback(feedback: string, relatedOutcomeId?: string): void {
    // Find the related outcome
    if (relatedOutcomeId) {
      const outcome = this.store.outcomes.find(o => o.id === relatedOutcomeId);
      if (outcome) {
        outcome.feedback = feedback;
      }
    }

    // Detect positive/negative sentiment
    const lower = feedback.toLowerCase();
    const isPositive = lower.includes("good") || lower.includes("perfect") ||
      lower.includes("great") || lower.includes("yes") || lower.includes("exactly");
    const isNegative = lower.includes("wrong") || lower.includes("bad") ||
      lower.includes("no") || lower.includes("don't") || lower.includes("stop");

    if (relatedOutcomeId) {
      const outcome = this.store.outcomes.find(o => o.id === relatedOutcomeId);
      if (outcome && isNegative) outcome.outcome = "failure";
      else if (outcome && isPositive) outcome.outcome = "success";
      const recent = this.store.outcomes.slice(-100);
      const successes = recent.filter(o => o.outcome === "success").length;
      this.store.sessionStats.successRate = recent.length ? successes / recent.length : 1;
    }

    // Store as preference in unified memory
    unifiedMemory.store_entry({
      source: "learning",
      category: "preference",
      content: `User feedback: ${feedback}`,
      tags: ["feedback", isPositive ? "positive" : isNegative ? "negative" : "neutral"],
      importance: isNegative ? "high" : "medium",
      confidence: 1.0,
    });

    this.save();
  }

  /** Conservative detector for direct corrections and durable behavior requests. */
  isExplicitFeedback(message: string): boolean {
    return /\b(that(?:'s| is) wrong|not what i asked|you misunderstood|don't do that|stop doing|next time|from now on|i prefer|please always|please never)\b/i.test(
      message
    );
  }

  getMostRecentOutcomeId(): string | undefined {
    return this.store.outcomes.at(-1)?.id;
  }

  // ─── Stats ────────────────────────────────────────────────────

  getStats(): LearningStore["sessionStats"] {
    return { ...this.store.sessionStats };
  }

  getPatterns(): PatternRecord[] {
    return [...this.store.patterns];
  }

  getStrategies(): StrategyRecord[] {
    return [...this.store.strategies];
  }

  // ─── Internals ────────────────────────────────────────────────

  private addOrUpdatePattern(params: {
    pattern: string;
    category: PatternRecord["category"];
    example: string;
  }): void {
    const existing = this.store.patterns.find(
      p => p.pattern === params.pattern || this.isSimilarPattern(p.pattern, params.pattern)
    );

    const now = new Date().toISOString();

    if (existing) {
      existing.frequency++;
      existing.lastSeen = now;
      existing.confidence = Math.min(1.0, existing.confidence + 0.05);
      if (params.example && existing.examples.length < 5) {
        existing.examples.push(params.example);
      }
    } else {
      this.store.patterns.push({
        id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pattern: params.pattern,
        category: params.category,
        frequency: 1,
        confidence: 0.5,
        firstSeen: now,
        lastSeen: now,
        examples: params.example ? [params.example] : [],
      });
    }

    // Cap at 100 patterns
    if (this.store.patterns.length > 100) {
      this.store.patterns.sort((a, b) => b.confidence - a.confidence);
      this.store.patterns = this.store.patterns.slice(0, 100);
    }
  }

  private isSimilarPattern(a: string, b: string): boolean {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    return intersection.size / Math.max(wordsA.size, wordsB.size) > 0.7;
  }

  private loadStore(): LearningStore {
    try {
      if (existsSync(LEARNING_FILE)) {
        return JSON.parse(readFileSync(LEARNING_FILE, "utf-8"));
      }
    } catch {
      console.warn("[LearningEngine] Failed to load, starting fresh");
    }

    return {
      version: 1,
      outcomes: [],
      patterns: [],
      strategies: [],
      sessionStats: {
        totalInteractions: 0,
        totalToolCalls: 0,
        successRate: 1.0,
        mostUsedTools: {},
        peakHours: {},
        topRequestCategories: {},
      },
      lastLearningCycle: "",
    };
  }

  private save(): void {
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      this.store.lastLearningCycle = new Date().toISOString();
      writeFileSync(LEARNING_FILE, JSON.stringify(this.store, null, 2), "utf-8");
    } catch (error) {
      console.error("[LearningEngine] Failed to save:", error);
    }
  }
}

// Singleton export
export const learningEngine = new LearningEngine();
