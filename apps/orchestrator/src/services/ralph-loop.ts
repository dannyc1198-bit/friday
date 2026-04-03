// Ralph Wiggum Thinking Loop for JARVIS
// Implements continuous iteration pattern for complex task completion
// Based on: https://github.com/vercel-labs/ralph-loop-agent

import { streamRawCompletion, type SimpleMessage } from "./openai.js";
import type { ToolResult } from "../types/index.js";

interface RalphLoopConfig {
  maxIterations: number;
  maxTokens: number;
  maxCost: number;
  stopOnSuccess: boolean;
  verificationPrompt?: string;
}

interface RalphLoopResult {
  success: boolean;
  iterations: number;
  totalTokens: number;
  estimatedCost: number;
  finalResult: string;
  allResults: string[];
  completionReason: "verified" | "max-iterations" | "max-tokens" | "max-cost" | "error";
  executionTime: number;
}

interface VerificationResult {
  complete: boolean;
  reason?: string;
  confidence: number;
}

// Default configuration
const DEFAULT_CONFIG: RalphLoopConfig = {
  maxIterations: 10,
  maxTokens: 100000,
  maxCost: 5.0, // $5 max
  stopOnSuccess: true,
};

// Token cost estimates (per 1K tokens) — Claude pricing
const TOKEN_COSTS = {
  "claude-sonnet": { input: 0.003, output: 0.015 },
  "claude-haiku": { input: 0.00025, output: 0.00125 },
};

/**
 * Ralph Wiggum Loop - Persistent iteration for complex tasks
 *
 * "The Ralph Wiggum technique is an iterative AI development methodology.
 * In its purest form, it's a simple while loop that repeatedly feeds an
 * AI agent a prompt until completion."
 */
export class RalphLoop {
  private config: RalphLoopConfig;
  private systemPrompt: string;
  private task: string;
  private context: string[];
  private totalTokens: number = 0;
  private estimatedCost: number = 0;

  constructor(task: string, config: Partial<RalphLoopConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.task = task;
    this.context = [];
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `You are JARVIS, an advanced AI assistant with persistent iteration capabilities.

CURRENT TASK:
${this.task}

ITERATION PROTOCOL:
1. Analyze the current state of the task
2. Identify what has been completed and what remains
3. Execute the next logical step
4. Verify your progress
5. If not complete, continue to next iteration

RULES:
- Be thorough and methodical
- Learn from previous iteration results
- Don't repeat failed approaches without modification
- Use available tools when needed
- Report your progress clearly

When the task is COMPLETE, say "TASK_COMPLETE" followed by a summary.
When the task CANNOT be completed, say "TASK_BLOCKED" followed by the reason.
When you need MORE INFORMATION, say "TASK_NEEDS_INPUT" followed by your question.`;
  }

  private async verifyCompletion(result: string): Promise<VerificationResult> {
    // Check for explicit completion markers
    if (result.includes("TASK_COMPLETE")) {
      return { complete: true, confidence: 0.95 };
    }

    if (result.includes("TASK_BLOCKED")) {
      return {
        complete: true,
        reason: "Task blocked - cannot proceed",
        confidence: 0.9,
      };
    }

    if (result.includes("TASK_NEEDS_INPUT")) {
      return {
        complete: false,
        reason: "Needs user input",
        confidence: 0.8,
      };
    }

    // Use custom verification if provided
    if (this.config.verificationPrompt) {
      const verificationResult = await this.runVerification(result);
      return verificationResult;
    }

    // Default: assume not complete unless marked
    return { complete: false, confidence: 0.5 };
  }

  private async runVerification(result: string): Promise<VerificationResult> {
    const verificationPrompt = `
Task: ${this.task}

Latest Result:
${result}

Question: Is this task complete? Respond with JSON:
{"complete": true/false, "reason": "explanation", "confidence": 0.0-1.0}`;

    try {
      const messages: SimpleMessage[] = [
        { role: "system", content: "You are a task verification assistant. Evaluate if tasks are complete." },
        { role: "user", content: verificationPrompt },
      ];

      let responseText = "";
      for await (const chunk of streamRawCompletion(messages)) {
        if (chunk.type === "text" && chunk.content) {
          responseText += chunk.content;
        }
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as VerificationResult;
      }
    } catch (error) {
      console.error("[RalphLoop] Verification failed:", error);
    }

    return { complete: false, confidence: 0.3 };
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private updateCost(inputTokens: number, outputTokens: number): void {
    const costs = TOKEN_COSTS["claude-sonnet"]; // Claude Sonnet 4
    this.estimatedCost += (inputTokens / 1000) * costs.input;
    this.estimatedCost += (outputTokens / 1000) * costs.output;
    this.totalTokens += inputTokens + outputTokens;
  }

  async run(onProgress?: (iteration: number, result: string) => void): Promise<RalphLoopResult> {
    const startTime = Date.now();
    const allResults: string[] = [];
    let iteration = 0;
    let finalResult = "";
    let completionReason: RalphLoopResult["completionReason"] = "max-iterations";

    console.log(`[RalphLoop] Starting task: ${this.task.substring(0, 100)}...`);

    while (iteration < this.config.maxIterations) {
      iteration++;
      console.log(`[RalphLoop] Iteration ${iteration}/${this.config.maxIterations}`);

      // Check token/cost limits
      if (this.totalTokens >= this.config.maxTokens) {
        completionReason = "max-tokens";
        break;
      }
      if (this.estimatedCost >= this.config.maxCost) {
        completionReason = "max-cost";
        break;
      }

      try {
        // Build messages with context from previous iterations
        const messages: SimpleMessage[] = [
          { role: "system", content: this.systemPrompt },
          ...this.context.map((c, i) => ({
            role: (i % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
            content: c,
          })),
          {
            role: "user",
            content: iteration === 1
              ? `Begin the task. This is iteration ${iteration}.`
              : `Continue the task. This is iteration ${iteration}. Previous context is available above.`,
          },
        ];

        // Estimate input tokens
        const inputTokens = this.estimateTokens(JSON.stringify(messages));

        // Run iteration
        let iterationResult = "";
        const toolResults: ToolResult[] = [];

        // Tool execution happens inside the agentic loop in streamRawCompletion
        for await (const chunk of streamRawCompletion(messages)) {
          if (chunk.type === "text" && chunk.content) {
            iterationResult += chunk.content;
          } else if (chunk.type === "tool_result" && chunk.toolResult) {
            // Collect results from the agentic tool loop
            toolResults.push({
              success: chunk.toolResult.success,
              data: chunk.toolResult.data,
              error: chunk.toolResult.error,
            } as ToolResult);
          }
        }

        // Add tool results to output
        if (toolResults.length > 0) {
          iterationResult += "\n\nTool Results:\n";
          toolResults.forEach(tr => {
            iterationResult += JSON.stringify(tr.data || tr.error, null, 2) + "\n";
          });
        }

        // Update tokens and cost
        const outputTokens = this.estimateTokens(iterationResult);
        this.updateCost(inputTokens, outputTokens);

        // Store result
        allResults.push(iterationResult);
        this.context.push(iterationResult);

        // Callback for progress
        if (onProgress) {
          onProgress(iteration, iterationResult);
        }

        // Verify completion
        const verification = await this.verifyCompletion(iterationResult);
        console.log(`[RalphLoop] Verification: complete=${verification.complete}, confidence=${verification.confidence}`);

        if (verification.complete && this.config.stopOnSuccess) {
          finalResult = iterationResult;
          completionReason = "verified";
          break;
        }

        // Add feedback for next iteration
        if (!verification.complete && verification.reason) {
          this.context.push(`Verification feedback: ${verification.reason}`);
        }

        finalResult = iterationResult;
      } catch (error) {
        console.error(`[RalphLoop] Iteration ${iteration} failed:`, error);
        allResults.push(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);

        // Continue trying unless critical error
        if (iteration >= this.config.maxIterations - 1) {
          completionReason = "error";
        }
      }
    }

    const executionTime = Date.now() - startTime;

    console.log(`[RalphLoop] Completed in ${iteration} iterations, ${executionTime}ms, ~$${this.estimatedCost.toFixed(4)}`);

    return {
      success: completionReason === "verified",
      iterations: iteration,
      totalTokens: this.totalTokens,
      estimatedCost: this.estimatedCost,
      finalResult,
      allResults,
      completionReason,
      executionTime,
    };
  }

  // Static helper to run a quick task
  static async execute(task: string, maxIterations: number = 5): Promise<RalphLoopResult> {
    const loop = new RalphLoop(task, { maxIterations });
    return loop.run();
  }
}

/**
 * Quick thinking loop for simple tasks
 */
export async function thinkAndExecute(task: string, options?: Partial<RalphLoopConfig>): Promise<RalphLoopResult> {
  const loop = new RalphLoop(task, options);
  return loop.run((iteration, result) => {
    console.log(`[Think] Iteration ${iteration}: ${result.substring(0, 200)}...`);
  });
}

/**
 * Deep thinking for complex tasks
 */
export async function deepThink(task: string): Promise<RalphLoopResult> {
  return thinkAndExecute(task, {
    maxIterations: 20,
    maxTokens: 200000,
    maxCost: 10.0,
    stopOnSuccess: true,
  });
}
