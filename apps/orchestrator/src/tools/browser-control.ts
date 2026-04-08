// Phase 4 — Browser Control via Playwright
// Connects to existing Chrome via CDP (port 18800) or launches fresh Chromium
// Shows cyan border overlay + "FRIDAY ACTIVE" badge when controlling browser

import { chromium, type Browser, type Page } from "playwright";
import { toolRegistry } from "./registry.js";
import type { Tool, ToolResult } from "../types/index.js";
import { writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { vault } from "../services/vault.js";
import { permissionManager } from "../services/permission-manager.js";

// ── State ──────────────────────────────────────────────────────────
let browser: Browser | null = null;
let activePage: Page | null = null;
const CDP_PORT = 18800;
const SCREENSHOT_DIR = join(process.cwd(), "data", "screenshots");
const MAX_SCREENSHOTS = 20;

// ── URL Safety ─────────────────────────────────────────────────────
const BLOCKED_URL_PATTERNS = [
  /^file:\/\//i,
  /^ftp:\/\//i,
  /^javascript:/i,
  /^data:/i,
  /^(https?:\/\/)?(10\.\d+\.\d+\.\d+)/,         // 10.x.x.x
  /^(https?:\/\/)?(172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)/, // 172.16-31.x.x
  /^(https?:\/\/)?(192\.168\.\d+\.\d+)/,          // 192.168.x.x
  /^(https?:\/\/)?(127\.\d+\.\d+\.\d+)/,          // 127.x.x.x
  /^(https?:\/\/)?localhost/i,                      // localhost
];

function isUrlSafe(url: string): boolean {
  // Only allow http and https — reject everything else
  if (!/^https?:\/\//i.test(url)) return false;
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  return true;
}

function normalizeUrl(url: string): string {
  if (!/^[a-z]+:\/\//i.test(url)) return `https://${url}`;
  return url;
}

// ── Connection ─────────────────────────────────────────────────────
async function getPage(): Promise<Page> {
  if (activePage && !activePage.isClosed()) return activePage;

  if (!browser || !browser.isConnected()) {
    try {
      // Try CDP connection to existing Chrome first
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, {
        timeout: 5000,
      });
      console.log("[Browser] Connected to Chrome via CDP");
    } catch {
      // Launch fresh Chromium
      browser = await chromium.launch({
        headless: false,
        args: ["--start-maximized"],
      });
      console.log("[Browser] Launched fresh Chromium");
    }
  }

  const contexts = browser.contexts();
  if (contexts.length > 0 && contexts[0].pages().length > 0) {
    activePage = contexts[0].pages()[0];
  } else {
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    activePage = await context.newPage();
  }

  await injectFRIDAYOverlay(activePage);
  return activePage;
}

// ── Visual Overlay (safe DOM — no innerHTML) ───────────────────────
async function injectFRIDAYOverlay(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      // Remove existing overlay if present
      const existing = document.getElementById("FRIDAY-overlay");
      if (existing) existing.remove();

      // Create overlay container
      const overlay = document.createElement("div");
      overlay.id = "FRIDAY-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;right:0;bottom:0;" +
        "border:3px solid #00e5ff;pointer-events:none;z-index:2147483647;";

      // Create badge
      const badge = document.createElement("div");
      badge.style.cssText =
        "position:absolute;top:8px;right:8px;background:#00e5ff;" +
        "color:#000;padding:4px 12px;border-radius:4px;" +
        "font-family:monospace;font-size:12px;font-weight:bold;" +
        "pointer-events:none;opacity:0.9;";
      badge.textContent = "FRIDAY ACTIVE";

      overlay.appendChild(badge);
      document.body.appendChild(overlay);
    });
  } catch {
    // Page may not be ready — non-critical
  }
}

async function removeFRIDAYOverlay(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const overlay = document.getElementById("FRIDAY-overlay");
      if (overlay) overlay.remove();
    });
  } catch {
    // Ignore — page might be closed
  }
}

// ── Screenshot Cleanup ─────────────────────────────────────────────
function cleanupScreenshots(): void {
  if (!existsSync(SCREENSHOT_DIR)) return;
  const files = readdirSync(SCREENSHOT_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({
      name: f,
      path: join(SCREENSHOT_DIR, f),
      time: parseInt(f.replace("screenshot-", "").replace(".png", ""), 10) || 0,
    }))
    .sort((a, b) => b.time - a.time);

  // Keep only the latest MAX_SCREENSHOTS
  for (const file of files.slice(MAX_SCREENSHOTS)) {
    try {
      unlinkSync(file.path);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ── Password Field Detection ───────────────────────────────────────
async function isPasswordField(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      return (
        el.getAttribute("type") === "password" ||
        el.getAttribute("autocomplete")?.includes("password") === true
      );
    }, selector);
  } catch {
    return false;
  }
}

// ── Tool Definitions ───────────────────────────────────────────────
const CATEGORY = "Browser Control";

const browserOpenTool: Tool = {
  name: "browser_open",
  description: "Open a URL in the browser. Connects to existing Chrome or launches new.",
  category: CATEGORY,
  parameters: [
    { name: "url", type: "string", description: "URL to open", required: true },
  ],
  execute: async (params) => {
    const url = normalizeUrl(params.url as string);
    if (!isUrlSafe(url)) {
      return { toolCallId: "", success: false, error: "URL blocked by security policy. Only http/https to public addresses allowed." };
    }
    try {
      const page = await getPage();
      await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await injectFRIDAYOverlay(page);
      return { toolCallId: "", success: true, data: { url, title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Failed to open URL: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserNavigateTool: Tool = {
  name: "browser_navigate",
  description: "Navigate the current browser tab to a new URL.",
  category: CATEGORY,
  parameters: [
    { name: "url", type: "string", description: "URL to navigate to", required: true },
  ],
  execute: async (params) => {
    const url = normalizeUrl(params.url as string);
    if (!isUrlSafe(url)) {
      return { toolCallId: "", success: false, error: "URL blocked by security policy." };
    }
    try {
      const page = await getPage();
      await page.goto(url, { timeout: 30000, waitUntil: "domcontentloaded" });
      await injectFRIDAYOverlay(page);
      return { toolCallId: "", success: true, data: { url, title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Navigation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserBackTool: Tool = {
  name: "browser_back",
  description: "Go back one page in browser history.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      await page.goBack({ timeout: 10000 });
      return { toolCallId: "", success: true, data: { url: page.url(), title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Back navigation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserForwardTool: Tool = {
  name: "browser_forward",
  description: "Go forward one page in browser history.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      await page.goForward({ timeout: 10000 });
      return { toolCallId: "", success: true, data: { url: page.url(), title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Forward navigation failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserRefreshTool: Tool = {
  name: "browser_refresh",
  description: "Refresh the current browser page.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      await page.reload({ timeout: 15000 });
      await injectFRIDAYOverlay(page);
      return { toolCallId: "", success: true, data: { url: page.url(), title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Refresh failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserScreenshotTool: Tool = {
  name: "browser_screenshot",
  description: "Take a screenshot of the current browser page. Returns the file path.",
  category: CATEGORY,
  parameters: [
    { name: "full_page", type: "boolean", description: "Capture full scrollable page (default: false, viewport only)", required: false },
  ],
  execute: async (params) => {
    try {
      const page = await getPage();
      if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = join(SCREENSHOT_DIR, filename);
      await page.screenshot({
        path: filepath,
        fullPage: params.full_page === true,
      });
      cleanupScreenshots();
      return { toolCallId: "", success: true, data: { path: filepath, url: page.url(), title: await page.title() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Screenshot failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserClickTool: Tool = {
  name: "browser_click",
  description: "Click an element on the page by CSS selector or text content.",
  category: CATEGORY,
  parameters: [
    { name: "selector", type: "string", description: "CSS selector or text to match (e.g., 'button.submit' or 'text=Sign In')", required: true },
  ],
  execute: async (params) => {
    const selector = params.selector as string;
    try {
      const page = await getPage();
      // Support text= prefix for text matching
      if (selector.startsWith("text=")) {
        await page.getByText(selector.replace("text=", "")).first().click({ timeout: 10000 });
      } else {
        await page.click(selector, { timeout: 10000 });
      }
      return { toolCallId: "", success: true, data: { clicked: selector } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Click failed on "${selector}": ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserTypeTool: Tool = {
  name: "browser_type",
  description: "Type text into an input field. Blocks typing into password fields for security.",
  category: CATEGORY,
  parameters: [
    { name: "selector", type: "string", description: "CSS selector of the input field", required: true },
    { name: "text", type: "string", description: "Text to type (max 500 chars)", required: true },
    { name: "clear_first", type: "boolean", description: "Clear the field before typing (default: true)", required: false },
  ],
  execute: async (params) => {
    const selector = params.selector as string;
    const text = (params.text as string).slice(0, 500); // Cap at 500 chars
    const clearFirst = params.clear_first !== false;

    try {
      const page = await getPage();

      // Security: block password fields
      if (await isPasswordField(page, selector)) {
        return { toolCallId: "", success: false, error: "Security: Cannot type into password fields. Use credential vault or ask the user to type manually." };
      }

      if (clearFirst) {
        await page.fill(selector, text, { timeout: 10000 });
      } else {
        await page.type(selector, text, { timeout: 10000 });
      }
      return { toolCallId: "", success: true, data: { selector, typed: text.length + " chars" } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Type failed on "${selector}": ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserPressKeyTool: Tool = {
  name: "browser_press_key",
  description: "Press a keyboard key in the browser (Enter, Tab, Escape, ArrowDown, etc.).",
  category: CATEGORY,
  parameters: [
    { name: "key", type: "string", description: "Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown', 'Control+a')", required: true },
  ],
  execute: async (params) => {
    const key = params.key as string;
    try {
      const page = await getPage();
      await page.keyboard.press(key);
      return { toolCallId: "", success: true, data: { pressed: key } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Key press failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserScrollTool: Tool = {
  name: "browser_scroll",
  description: "Scroll the browser page up or down.",
  category: CATEGORY,
  parameters: [
    { name: "direction", type: "string", description: "Scroll direction", required: true, enum: ["up", "down"] },
    { name: "amount", type: "number", description: "Pixels to scroll (default: 500)", required: false },
  ],
  execute: async (params) => {
    const direction = params.direction as string;
    const amount = (params.amount as number) || 500;
    const delta = direction === "up" ? -amount : amount;
    try {
      const page = await getPage();
      await page.evaluate((d) => window.scrollBy(0, d), delta);
      return { toolCallId: "", success: true, data: { direction, pixels: amount } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Scroll failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserSelectTool: Tool = {
  name: "browser_select",
  description: "Select an option from a dropdown/select element.",
  category: CATEGORY,
  parameters: [
    { name: "selector", type: "string", description: "CSS selector of the select element", required: true },
    { name: "value", type: "string", description: "Value or label to select", required: true },
  ],
  execute: async (params) => {
    const selector = params.selector as string;
    const value = params.value as string;
    try {
      const page = await getPage();
      await page.selectOption(selector, value, { timeout: 10000 });
      return { toolCallId: "", success: true, data: { selector, selected: value } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Select failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserGetTextTool: Tool = {
  name: "browser_get_text",
  description: "Get the text content of an element on the page.",
  category: CATEGORY,
  parameters: [
    { name: "selector", type: "string", description: "CSS selector of the element", required: true },
  ],
  execute: async (params) => {
    const selector = params.selector as string;
    try {
      const page = await getPage();
      const text = await page.textContent(selector, { timeout: 10000 });
      return { toolCallId: "", success: true, data: { selector, text: text?.slice(0, 5000) || "" } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Get text failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserGetPageTitleTool: Tool = {
  name: "browser_get_page_title",
  description: "Get the title of the current browser page.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      return { toolCallId: "", success: true, data: { title: await page.title(), url: page.url() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Failed to get title: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserGetUrlTool: Tool = {
  name: "browser_get_url",
  description: "Get the current URL of the browser.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      return { toolCallId: "", success: true, data: { url: page.url() } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Failed to get URL: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserGetPageContentTool: Tool = {
  name: "browser_get_page_content",
  description: "Get the readable text content of the entire page (no HTML tags). Max 10000 chars.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      const page = await getPage();
      const text = await page.evaluate(() => {
        // Remove script, style, and hidden elements
        const clone = document.body.cloneNode(true) as HTMLElement;
        const removeSelectors = ["script", "style", "noscript", "svg", "[hidden]", '[aria-hidden="true"]'];
        for (const sel of removeSelectors) {
          clone.querySelectorAll(sel).forEach((el) => el.remove());
        }
        return (clone.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
      });
      return {
        toolCallId: "",
        success: true,
        data: { content: text.slice(0, 10000), url: page.url(), title: await page.title(), truncated: text.length > 10000 },
      };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Failed to get content: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserListTabsTool: Tool = {
  name: "browser_list_tabs",
  description: "List all open browser tabs with their titles and URLs.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      if (!browser || !browser.isConnected()) {
        return { toolCallId: "", success: false, error: "No browser connected" };
      }
      const tabs: { index: number; title: string; url: string; active: boolean }[] = [];
      for (const context of browser.contexts()) {
        for (let i = 0; i < context.pages().length; i++) {
          const p = context.pages()[i];
          tabs.push({
            index: i,
            title: await p.title(),
            url: p.url(),
            active: p === activePage,
          });
        }
      }
      return { toolCallId: "", success: true, data: { tabs, count: tabs.length } };
    } catch (error) {
      return { toolCallId: "", success: false, error: `Failed to list tabs: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserCloseTool: Tool = {
  name: "browser_close",
  description: "Close the browser connection and remove FRIDAY overlay. Does not close Chrome itself when connected via CDP.",
  category: CATEGORY,
  parameters: [],
  execute: async () => {
    try {
      if (activePage && !activePage.isClosed()) {
        await removeFRIDAYOverlay(activePage);
      }
      activePage = null;
      if (browser) {
        await browser.close();
        browser = null;
      }
      return { toolCallId: "", success: true, data: { message: "Browser connection closed" } };
    } catch (error) {
      browser = null;
      activePage = null;
      return { toolCallId: "", success: false, error: `Close failed: ${error instanceof Error ? error.message : "Unknown error"}` };
    }
  },
};

const browserLoginTool: Tool = {
  name: "browser_login",
  description:
    "Securely log into a website using credentials from the encrypted vault. Requires vault unlocked and PIN verified.",
  category: CATEGORY,
  parameters: [
    { name: "site", type: "string", description: "Site name matching a vault entry (e.g., 'linkedin', 'github')", required: true },
    { name: "login_url", type: "string", description: "Override URL for the login page (default: https://<site>.com/login)", required: false },
    {
      name: "username_selector",
      type: "string",
      description:
        'CSS selector for the username/email field (default: #username, #email, [name="email"], [name="username"], [type="email"])',
      required: false,
    },
    {
      name: "password_selector",
      type: "string",
      description:
        'CSS selector for the password field (default: #password, [name="password"], [type="password"])',
      required: false,
    },
    {
      name: "submit_selector",
      type: "string",
      description:
        'CSS selector for the submit button (default: [type="submit"], button[type="submit"])',
      required: false,
    },
  ],
  execute: async (params) => {
    const site = params.site as string;
    const loginUrl =
      (params.login_url as string) || `https://${site}.com/login`;
    const usernameSelector =
      (params.username_selector as string) ||
      '#username, #email, [name="email"], [name="username"], [type="email"]';
    const passwordSelector =
      (params.password_selector as string) ||
      '#password, [name="password"], [type="password"]';
    const submitSelector =
      (params.submit_selector as string) ||
      '[type="submit"], button[type="submit"]';

    // ── Security gates ────────────────────────────────────────
    if (vault.isLocked()) {
      return {
        toolCallId: "",
        success: false,
        error:
          "Vault is locked. Please unlock it first with your master password.",
      };
    }

    if (!permissionManager.isVerified()) {
      return {
        toolCallId: "",
        success: false,
        error: "PIN verification required for credential access.",
      };
    }

    const creds = vault.getCredential(site);
    if (!creds) {
      return {
        toolCallId: "",
        success: false,
        error: `No credentials stored for "${site}". Add them with vault_add first.`,
      };
    }

    try {
      // ── Navigate to login page ──────────────────────────────
      const normalizedUrl = normalizeUrl(loginUrl);
      if (!isUrlSafe(normalizedUrl)) {
        return {
          toolCallId: "",
          success: false,
          error: "Login URL blocked by security policy.",
        };
      }

      const page = await getPage();
      await page.goto(normalizedUrl, {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
      await injectFRIDAYOverlay(page);

      // Random delay helper (300-700ms) to mimic human typing cadence
      const humanDelay = () =>
        new Promise<void>((resolve) =>
          setTimeout(resolve, 300 + Math.random() * 400)
        );

      // ── Fill username (bypass password-field block — authorized flow) ──
      await humanDelay();
      await page.fill(usernameSelector, creds.username, { timeout: 10000 });

      // ── Fill password (uses page.fill directly — authorized flow) ──
      await humanDelay();
      await page.fill(passwordSelector, creds.password, { timeout: 10000 });

      // ── Submit ──────────────────────────────────────────────
      await page.click(submitSelector, { timeout: 10000 });

      // Wait for navigation / page load
      await page.waitForTimeout(2000);

      const title = await page.title();
      return {
        toolCallId: "",
        success: true,
        data: {
          site,
          url: page.url(),
          title,
          message: `Logged into ${site} successfully.`,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Login failed for "${site}": ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// ── Registration ───────────────────────────────────────────────────
export function registerBrowserTools(): void {
  toolRegistry.register(browserOpenTool);
  toolRegistry.register(browserNavigateTool);
  toolRegistry.register(browserBackTool);
  toolRegistry.register(browserForwardTool);
  toolRegistry.register(browserRefreshTool);
  toolRegistry.register(browserScreenshotTool);
  toolRegistry.register(browserClickTool);
  toolRegistry.register(browserTypeTool);
  toolRegistry.register(browserPressKeyTool);
  toolRegistry.register(browserScrollTool);
  toolRegistry.register(browserSelectTool);
  toolRegistry.register(browserGetTextTool);
  toolRegistry.register(browserGetPageTitleTool);
  toolRegistry.register(browserGetUrlTool);
  toolRegistry.register(browserGetPageContentTool);
  toolRegistry.register(browserListTabsTool);
  toolRegistry.register(browserCloseTool);
  toolRegistry.register(browserLoginTool);
}

// Export for screen reader access
export { getPage, browser, SCREENSHOT_DIR };
