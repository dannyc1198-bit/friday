// Wavelength Business Context Loader
// Reads Danny's editable markdown brain file and injects it into FRIDAY's
// system prompt when business-related intent is detected in the user message.
//
// File location: {OBSIDIAN_VAULT_PATH}/FRIDAY_BRAIN/wavelength-context.md
// Danny edits this file directly in Obsidian — FRIDAY reloads on orchestrator
// restart or via the `wavelength_reload` tool.

import { promises as fs } from "fs";
import path from "path";
import { config } from "../config/index.js";

const CONTEXT_RELATIVE_PATH = path.join("FRIDAY_BRAIN", "wavelength-context.md");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ContextCache {
  body: string | null; // null = file missing / unreadable (still cached to avoid hammering disk)
  loadedAt: number;
}

let cache: ContextCache | null = null;

// Intent keywords — matched case-insensitively against the user message.
// Keep broad enough to catch business tasks, narrow enough to avoid false positives.
const BUSINESS_KEYWORDS: string[] = [
  "wavelength",
  "client",
  "prospect",
  "lead",
  "proposal",
  "pitch",
  "objection",
  "sales",
  "pipeline",
  "deal",
  "outreach",
  "linkedin post",
  "cold email",
  "revenue leak",
  "trades business",
  "plumber",
  "plumbing",
  "hvac",
  "electrician",
  "chadwick",
  "receptionist",
  "audit",
];

function contextFilePath(): string {
  return path.join(config.obsidianVaultPath, CONTEXT_RELATIVE_PATH);
}

/**
 * Strip YAML frontmatter (--- ... ---) from the top of a markdown document.
 */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const endIdx = raw.indexOf("\n---", 3);
  if (endIdx === -1) return raw;
  // Skip past the closing --- and following newline
  const afterClose = raw.indexOf("\n", endIdx + 4);
  return afterClose === -1 ? "" : raw.slice(afterClose + 1).trimStart();
}

/**
 * Read the Wavelength context file from disk, stripping frontmatter.
 * Returns null if the file doesn't exist or can't be read (graceful fallback).
 * Caches the result for 5 minutes.
 */
export async function loadWavelengthContext(): Promise<string | null> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.body;
  }

  try {
    const raw = await fs.readFile(contextFilePath(), "utf-8");
    const body = stripFrontmatter(raw).trim();
    cache = { body: body || null, loadedAt: now };
    return cache.body;
  } catch {
    // File missing or unreadable — cache null so we don't retry every request.
    cache = { body: null, loadedAt: now };
    return null;
  }
}

/**
 * Invalidate the context cache so the next read goes back to disk.
 * Called by the `wavelength_reload` tool.
 */
export function reloadWavelengthContext(): void {
  cache = null;
}

/**
 * Detect whether a user message is business-related and should trigger
 * injection of the Wavelength context into the system prompt.
 */
export function shouldInjectWavelengthContext(userMessage: string): boolean {
  if (!userMessage) return false;
  const lower = userMessage.toLowerCase();
  return BUSINESS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Convenience: returns the wrapped injection string if business intent matches
 * AND the context file is available. Returns null otherwise.
 */
export async function getWavelengthPromptExtras(
  userMessage: string
): Promise<string | null> {
  if (!shouldInjectWavelengthContext(userMessage)) return null;
  const body = await loadWavelengthContext();
  if (!body) return null;
  return `\n\n## WAVELENGTH BUSINESS CONTEXT\n\n${body}\n\nApply this context when acting on business tasks.`;
}
