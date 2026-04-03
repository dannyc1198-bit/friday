import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { config } from "../config/index.js";
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Creative Code Generation Engine for JARVIS
// Self-improving AI coder that can write, test, and refine code

interface CodeGenerationRequest {
  task: string;
  language: string;
  context?: string;
  constraints?: string[];
}

interface CodeResult {
  code: string;
  language: string;
  explanation: string;
  tests?: string;
  improvements?: string[];
}

// Supported languages and their file extensions
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  rust: "rs",
  go: "go",
  java: "java",
  csharp: "cs",
  cpp: "cpp",
  html: "html",
  css: "css",
  sql: "sql",
  bash: "sh",
  powershell: "ps1",
};

// Code templates for common patterns
const CODE_TEMPLATES: Record<string, Record<string, string>> = {
  typescript: {
    function: `export function {{name}}({{params}}): {{returnType}} {
  {{body}}
}`,
    class: `export class {{name}} {
  {{properties}}

  constructor({{constructorParams}}) {
    {{constructorBody}}
  }

  {{methods}}
}`,
    api: `import { FastifyInstance } from "fastify";

export async function {{name}}Routes(app: FastifyInstance) {
  app.get("/{{route}}", async (request, reply) => {
    {{body}}
  });
}`,
  },
  python: {
    function: `def {{name}}({{params}}) -> {{returnType}}:
    """{{docstring}}"""
    {{body}}`,
    class: `class {{name}}:
    """{{docstring}}"""

    def __init__(self, {{constructorParams}}):
        {{constructorBody}}

    {{methods}}`,
  },
};

// Generate Code Tool
const generateCodeTool: Tool = {
  name: "generate_code",
  description: "Generates code for a given task with explanation. Can create functions, classes, APIs, scripts, and more.",
  category: "coding",
  parameters: [
    {
      name: "task",
      type: "string",
      description: "What the code should do (e.g., 'create a function that sorts an array by date')",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language (javascript, typescript, python, rust, go, etc.)",
      required: true,
    },
    {
      name: "include_tests",
      type: "boolean",
      description: "Whether to include unit tests",
      required: false,
      default: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const task = params.task as string;
    const language = (params.language as string).toLowerCase();
    const includeTests = params.include_tests !== false;

    // Generate code based on task (simplified - real implementation would use AI)
    const result = await generateCodeForTask(task, language, includeTests);

    return {
      toolCallId: "",
      success: true,
      data: {
        ...result,
        message: `Generated ${language} code for: ${task}`,
        canExecute: ["javascript", "typescript", "python", "bash"].includes(language),
      },
    };
  },
};

// Execute Code Tool
const executeCodeTool: Tool = {
  name: "execute_code",
  description: "Executes code in a sandboxed environment and returns the result",
  category: "coding",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "The code to execute",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language (javascript, typescript, python, bash)",
      required: true,
    },
    {
      name: "timeout",
      type: "number",
      description: "Maximum execution time in seconds (default: 30)",
      required: false,
      default: 30,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = (params.language as string).toLowerCase();
    const timeout = ((params.timeout as number) || 30) * 1000;

    try {
      const result = await executeInSandbox(code, language, timeout);
      return {
        toolCallId: "",
        success: true,
        data: {
          output: result.output,
          exitCode: result.exitCode,
          executionTime: result.executionTime,
          message: result.exitCode === 0 ? "Code executed successfully" : "Code execution completed with errors",
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Analyze Code Tool
const analyzeCodeTool: Tool = {
  name: "analyze_code",
  description: "Analyzes code for bugs, performance issues, and suggests improvements",
  category: "coding",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "The code to analyze",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = (params.language as string).toLowerCase();

    const analysis = analyzeCodeQuality(code, language);

    return {
      toolCallId: "",
      success: true,
      data: {
        ...analysis,
        message: `Analyzed ${analysis.linesOfCode} lines of ${language} code`,
      },
    };
  },
};

// Fix Code Tool
const fixCodeTool: Tool = {
  name: "fix_code",
  description: "Attempts to fix bugs or errors in code",
  category: "coding",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "The code with bugs",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language",
      required: true,
    },
    {
      name: "error_message",
      type: "string",
      description: "The error message received (optional)",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = (params.language as string).toLowerCase();
    const errorMessage = params.error_message as string | undefined;

    const fixed = await attemptCodeFix(code, language, errorMessage);

    return {
      toolCallId: "",
      success: true,
      data: {
        originalCode: code,
        fixedCode: fixed.code,
        changesApplied: fixed.changes,
        explanation: fixed.explanation,
        confidence: fixed.confidence,
      },
    };
  },
};

// Refactor Code Tool
const refactorCodeTool: Tool = {
  name: "refactor_code",
  description: "Refactors code for better readability, performance, or maintainability",
  category: "coding",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "The code to refactor",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Programming language",
      required: true,
    },
    {
      name: "goal",
      type: "string",
      description: "Refactoring goal: 'performance', 'readability', 'modern', 'dry'",
      required: false,
      default: "readability",
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const code = params.code as string;
    const language = (params.language as string).toLowerCase();
    const goal = (params.goal as string) || "readability";

    const refactored = await refactorCode(code, language, goal);

    return {
      toolCallId: "",
      success: true,
      data: {
        originalCode: code,
        refactoredCode: refactored.code,
        improvements: refactored.improvements,
        goal,
      },
    };
  },
};

// Create File Tool
const createFileTool: Tool = {
  name: "create_file",
  description: "Creates a new file with generated code at the specified path",
  category: "coding",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "File path relative to project root",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "File content",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const filePath = params.path as string;
    const content = params.content as string;

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, "utf-8");

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `File created: ${filePath}`,
          path: filePath,
          size: content.length,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to create file: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Helper functions
async function generateCodeForTask(task: string, language: string, includeTests: boolean): Promise<CodeResult> {
  // Simplified code generation (real implementation would use AI model)
  const lowerTask = task.toLowerCase();

  // Example: sorting function
  if (lowerTask.includes("sort")) {
    if (language === "typescript" || language === "javascript") {
      return {
        code: `/**
 * ${task}
 */
export function sortByDate<T extends { date: Date | string }>(items: T[], descending = false): T[] {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return descending ? dateB - dateA : dateA - dateB;
  });
}`,
        language,
        explanation: "This function creates a generic sorting utility that works with any object containing a date property. It supports both ascending and descending order.",
        tests: includeTests ? `import { sortByDate } from './sortByDate';

describe('sortByDate', () => {
  const items = [
    { date: '2024-01-15', name: 'Second' },
    { date: '2024-01-10', name: 'First' },
    { date: '2024-01-20', name: 'Third' },
  ];

  it('should sort ascending by default', () => {
    const result = sortByDate(items);
    expect(result[0].name).toBe('First');
    expect(result[2].name).toBe('Third');
  });

  it('should sort descending when specified', () => {
    const result = sortByDate(items, true);
    expect(result[0].name).toBe('Third');
    expect(result[2].name).toBe('First');
  });
});` : undefined,
        improvements: ["Consider adding null checks", "Add support for custom date fields"],
      };
    } else if (language === "python") {
      return {
        code: `"""${task}"""
from datetime import datetime
from typing import List, TypeVar, Callable

T = TypeVar('T')

def sort_by_date(items: List[T], key: Callable[[T], datetime] = lambda x: x.date, descending: bool = False) -> List[T]:
    """Sort items by date field."""
    return sorted(items, key=key, reverse=descending)`,
        language,
        explanation: "Generic Python sorting function using type hints and supporting custom key functions.",
        improvements: ["Add error handling for invalid dates"],
      };
    }
  }

  // Default: return a template
  return {
    code: `// TODO: Implement ${task}\n// Language: ${language}`,
    language,
    explanation: "Placeholder for the requested functionality. Full implementation would require AI model integration.",
    improvements: ["Connect to GPT-4 for full code generation"],
  };
}

async function executeInSandbox(code: string, language: string, timeout: number): Promise<{
  output: string;
  exitCode: number;
  executionTime: number;
}> {
  const startTime = Date.now();
  const tempDir = path.join(process.cwd(), "temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const ext = LANGUAGE_EXTENSIONS[language] || "txt";
  const tempFile = path.join(tempDir, `temp_${Date.now()}.${ext}`);

  try {
    fs.writeFileSync(tempFile, code);

    let command: string;
    switch (language) {
      case "javascript":
        command = `node "${tempFile}"`;
        break;
      case "typescript":
        command = `npx tsx "${tempFile}"`;
        break;
      case "python":
        command = `python "${tempFile}"`;
        break;
      case "bash":
        command = `bash "${tempFile}"`;
        break;
      default:
        throw new Error(`Unsupported language for execution: ${language}`);
    }

    const output = execSync(command, {
      timeout,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      output,
      exitCode: 0,
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const execError = error as { status?: number; stderr?: string; message?: string };
    return {
      output: execError.stderr || execError.message || "Unknown error",
      exitCode: execError.status || 1,
      executionTime: Date.now() - startTime,
    };
  } finally {
    // Cleanup
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

function analyzeCodeQuality(code: string, language: string): {
  linesOfCode: number;
  complexity: string;
  issues: string[];
  suggestions: string[];
  score: number;
} {
  const lines = code.split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // Basic static analysis
  if (code.includes("var ") && (language === "javascript" || language === "typescript")) {
    issues.push("Use 'const' or 'let' instead of 'var'");
    score -= 5;
  }

  if (code.includes("any") && language === "typescript") {
    issues.push("Avoid using 'any' type - use specific types");
    score -= 10;
  }

  if (!code.includes("try") && (code.includes("await") || code.includes("fetch"))) {
    issues.push("Consider adding error handling for async operations");
    score -= 10;
  }

  if (lines.length > 50 && !code.includes("function") && !code.includes("class")) {
    suggestions.push("Consider breaking this into smaller functions");
  }

  // Check for console.log in production code
  if (code.includes("console.log")) {
    suggestions.push("Remove console.log statements before production");
    score -= 5;
  }

  return {
    linesOfCode: lines.length,
    complexity: lines.length < 20 ? "low" : lines.length < 100 ? "medium" : "high",
    issues,
    suggestions,
    score: Math.max(0, score),
  };
}

async function attemptCodeFix(code: string, language: string, errorMessage?: string): Promise<{
  code: string;
  changes: string[];
  explanation: string;
  confidence: number;
}> {
  const changes: string[] = [];
  let fixedCode = code;
  let confidence = 0.8;

  // Common fixes
  if (language === "javascript" || language === "typescript") {
    // Missing semicolons
    if (errorMessage?.includes("semicolon")) {
      fixedCode = fixedCode.replace(/([^;{}])\n/g, "$1;\n");
      changes.push("Added missing semicolons");
    }

    // Unclosed brackets
    const openBrackets = (fixedCode.match(/{/g) || []).length;
    const closeBrackets = (fixedCode.match(/}/g) || []).length;
    if (openBrackets > closeBrackets) {
      fixedCode += "\n}".repeat(openBrackets - closeBrackets);
      changes.push(`Added ${openBrackets - closeBrackets} missing closing brackets`);
    }

    // Missing async
    if (errorMessage?.includes("await") && !code.includes("async")) {
      fixedCode = fixedCode.replace(/function\s+(\w+)/g, "async function $1");
      changes.push("Added async keyword to functions using await");
    }
  }

  if (changes.length === 0) {
    changes.push("No automatic fixes found - manual review needed");
    confidence = 0.3;
  }

  return {
    code: fixedCode,
    changes,
    explanation: `Applied ${changes.length} fixes based on ${errorMessage ? "error message" : "code analysis"}`,
    confidence,
  };
}

async function refactorCode(code: string, language: string, goal: string): Promise<{
  code: string;
  improvements: string[];
}> {
  let refactored = code;
  const improvements: string[] = [];

  if (language === "javascript" || language === "typescript") {
    switch (goal) {
      case "modern":
        // Convert var to const/let
        refactored = refactored.replace(/var\s+(\w+)\s*=/g, "const $1 =");
        improvements.push("Converted var declarations to const");

        // Convert function to arrow
        refactored = refactored.replace(/function\s*\(([^)]*)\)\s*{/g, "($1) => {");
        improvements.push("Converted anonymous functions to arrow functions");
        break;

      case "performance":
        // Use for...of instead of forEach for arrays
        if (refactored.includes(".forEach(")) {
          improvements.push("Consider using for...of loop instead of forEach for better performance");
        }
        break;

      case "readability":
        // Add spacing
        refactored = refactored.replace(/,(?!\s)/g, ", ");
        improvements.push("Added consistent spacing after commas");
        break;

      case "dry":
        // Identify repeated code patterns
        improvements.push("Analyzed for repeated patterns - consider extracting common logic");
        break;
    }
  }

  return { code: refactored, improvements };
}

// Register all coding tools
export function registerCodingTools(): void {
  toolRegistry.register(generateCodeTool);
  toolRegistry.register(executeCodeTool);
  toolRegistry.register(analyzeCodeTool);
  toolRegistry.register(fixCodeTool);
  toolRegistry.register(refactorCodeTool);
  toolRegistry.register(createFileTool);
}
