// Central gate for browser actions that can submit, pay, or send.
// Approval is bound to the exact action, destination, content, and amount.
// A tool name that does not contain "send" is not enough to let it through.

export interface EffectBinding {
  tool: string;
  action: string;
  destination: string;
  content: string;
  amount: string;
}

export interface BrowserEffectContext {
  url: string;
  stagedText: string;
}

const SUBMIT_WORDS = /\b(send|buy|purchase|checkout|pay|place[ -]?order|trade|submit|order now|complete purchase|confirm payment)\b/i;
const SUBMIT_CONTROL = /type\s*=\s*["']?submit|\bsubmit\b/i;

let context: BrowserEffectContext = { url: "unknown page", stagedText: "" };
let urlLocator: () => string = () => context.url;

interface StagedEffect {
  tool: string;
  parameters: Record<string, unknown>;
  binding: EffectBinding;
  expires: number;
}

const staged = new Map<string, StagedEffect>();
const granted = new Map<string, number>();

export function noteBrowserDraft(text: string): void {
  context = { ...context, stagedText: text.slice(0, 500) };
}

export function noteBrowserPage(url: string): void {
  if (url) context = { ...context, url };
}

export function setBrowserUrlLocator(locator: () => string): void {
  urlLocator = locator;
}

export function browserEffectContext(): BrowserEffectContext {
  let url = context.url;
  try {
    url = urlLocator() || url;
  } catch {
    url = context.url;
  }
  return { url: url || "unknown page", stagedText: context.stagedText };
}

export function amountIn(text: string): string {
  const match = text.match(/(?:\$|USD\s*)\d[\d,]*(?:\.\d{2})?|\b\d+(?:\.\d{2})?\s*(?:USD|dollars)\b/i);
  return match ? match[0] : "unspecified";
}

export function bindingKey(binding: EffectBinding): string {
  return JSON.stringify([binding.tool, binding.action, binding.destination, binding.content, binding.amount]);
}

export function assessBrowserEffect(
  tool: string,
  params: Record<string, unknown>,
  ctx: BrowserEffectContext
): EffectBinding | null {
  const destination = ctx.url || "unknown page";
  const stagedText = ctx.stagedText || "";
  if (tool === "browser_type") {
    const text = String(params.text || "");
    if (!/[\r\n]/.test(text)) return null;
    return {
      tool,
      action: "submit-by-newline",
      destination,
      content: text.slice(0, 500),
      amount: amountIn(text),
    };
  }
  if (tool === "browser_press_key" && /enter/i.test(String(params.key || ""))) {
    return {
      tool,
      action: "key-submit",
      destination,
      content: stagedText || "(no text staged)",
      amount: amountIn(stagedText),
    };
  }
  if (tool === "browser_click") {
    const selector = String(params.selector || "");
    if (!SUBMIT_WORDS.test(selector) && !SUBMIT_CONTROL.test(selector)) return null;
    const content = stagedText || "(no text staged)";
    return {
      tool,
      action: "click-submit",
      destination,
      content,
      amount: amountIn(`${content} ${selector}`),
    };
  }
  return null;
}

export function stageEffect(
  tool: string,
  parameters: Record<string, unknown>,
  binding: EffectBinding,
  now = Date.now()
): string {
  const token = `effect_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  staged.set(token, { tool, parameters, binding, expires: now + 2 * 60_000 });
  return token;
}

export function consumeGrantedEffect(binding: EffectBinding, now = Date.now()): boolean {
  const key = bindingKey(binding);
  const expires = granted.get(key);
  if (!expires || expires <= now) {
    granted.delete(key);
    return false;
  }
  granted.delete(key);
  return true;
}

export function takeStagedEffect(token: string, now = Date.now()): StagedEffect | null {
  const item = staged.get(token);
  if (!item) return null;
  staged.delete(token);
  if (item.expires <= now) return null;
  return item;
}

export function grantEffect(binding: EffectBinding, now = Date.now()): void {
  granted.set(bindingKey(binding), now + 2 * 60_000);
}

/** Local reads and vault notes pass. Posts, sends, and deletes need a grant. */
export function assessOutgoingAction(action: string, destination: string, content: string): EffectBinding | null {
  const normalized = action.trim().toLowerCase();
  if (normalized === "get" || normalized === "read" || normalized === "vault-write" || normalized === "open-file") {
    return null;
  }
  if (/^(post|put|patch|delete|send|publish)$/.test(normalized)) {
    return {
      tool: "memory-port",
      action: normalized,
      destination: destination.slice(0, 300) || "unknown",
      content: content.slice(0, 500),
      amount: amountIn(content),
    };
  }
  return null;
}

export function requireGrantedOutgoing(action: string, destination: string, content: string): void {
  const binding = assessOutgoingAction(action, destination, content);
  if (!binding) return;
  if (consumeGrantedEffect(binding)) return;
  const token = stageEffect("memory-port", { action, destination }, binding);
  throw new Error(`That leaves the machine (${binding.action}). Confirm effect ${token} before I do it.`);
}

export function resetEffectGate(): void {
  context = { url: "unknown page", stagedText: "" };
  urlLocator = () => context.url;
  staged.clear();
  granted.clear();
}
