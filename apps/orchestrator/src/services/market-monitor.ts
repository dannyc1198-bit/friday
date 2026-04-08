// Market Monitor — Live crypto & stock prices with configurable alerts
//
// Runs every 5 minutes. Fetches prices via CoinGecko (free, no key).
// Feeds the FRIDAY HUD and fires proactive alerts on significant moves.
//
// Alert rules (see FRIDAY-config.json for thresholds):
//   - Default: alert when any watched asset moves ±5% in 24h
//   - Custom alerts set via voice: "FRIDAY, alert me when XRP hits $3"
//   - Alerts respect quiet hours (11 PM – 5 AM) and 3/hour cap
//   - Price data is always fresh for HUD — alerts are separately gated

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────

export interface AssetPrice {
  symbol: string;
  price: number;
  changePercent24h: number;
  updatedAt: string;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  type: "change_pct" | "price_above" | "price_below";
  threshold: number;
  note?: string;         // e.g. "FRIDAY, alert me when XRP hits $3"
  triggered: boolean;
  createdAt: string;
}

interface MarketStore {
  prices: Record<string, AssetPrice>;
  customAlerts: PriceAlert[];
  lastFetch: string;
}

// ─── Constants ───────────────────────────────────────────────────

const POLL_INTERVAL_MS    = 5 * 60 * 1000;  // 5 minutes
const QUIET_HOUR_START    = 23;
const QUIET_HOUR_END      = 5;
const DEFAULT_CHANGE_PCT  = 5;              // Alert threshold: ±5%

const USER_HOME = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368";
const DATA_DIR  = join(USER_HOME, "jarvis", "apps", "orchestrator", "data");
const STORE_FILE = join(DATA_DIR, "market-store.json");

// CoinGecko IDs for the symbols we track
const WATCHLIST: Record<string, string> = {
  XRP:  "ripple",
  XLM:  "stellar",
  HBAR: "hedera-hashgraph",
  BTC:  "bitcoin",
  ETH:  "ethereum",
};

// ─── Helpers ─────────────────────────────────────────────────────

function isQuietHours(): boolean {
  const hour = new Date().getHours();
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

function formatPrice(symbol: string, price: number): string {
  return price < 1
    ? `$${price.toFixed(4)}`
    : `$${price.toFixed(2)}`;
}

function formatChange(pct: number): string {
  const sign = pct >= 0 ? "up" : "down";
  return `${sign} ${Math.abs(pct).toFixed(1)}%`;
}

// ─── Market Monitor ───────────────────────────────────────────────

class MarketMonitor {
  private store: MarketStore;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private alertCallbacks: Array<(msg: string, symbol: string) => void> = [];

  constructor() {
    this.store = this.loadStore();
  }

  // ── Public API ───────────────────────────────────────────────

  start(): void {
    if (this.intervalHandle) return;
    console.log("[Market Monitor] Started — polling every 5 minutes");
    this.fetchPrices(); // immediate fetch on start
    this.intervalHandle = setInterval(() => this.fetchPrices(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Subscribe to price alerts. Callback receives spoken message + symbol. */
  onAlert(cb: (message: string, symbol: string) => void): void {
    this.alertCallbacks.push(cb);
  }

  /** Get latest cached prices for all watched assets */
  getPrices(): AssetPrice[] {
    return Object.values(this.store.prices);
  }

  /** Get latest price for a specific symbol */
  getPrice(symbol: string): AssetPrice | null {
    return this.store.prices[symbol.toUpperCase()] ?? null;
  }

  /** Add a custom price alert (e.g. "alert me when XRP hits $3") */
  addCustomAlert(params: {
    symbol: string;
    type: PriceAlert["type"];
    threshold: number;
    note?: string;
  }): PriceAlert {
    const alert: PriceAlert = {
      id: `alert_${Date.now()}`,
      symbol: params.symbol.toUpperCase(),
      type: params.type,
      threshold: params.threshold,
      note: params.note,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    this.store.customAlerts.push(alert);
    this.save();
    return alert;
  }

  /** Remove a custom alert by ID */
  removeCustomAlert(id: string): boolean {
    const before = this.store.customAlerts.length;
    this.store.customAlerts = this.store.customAlerts.filter((a) => a.id !== id);
    const removed = this.store.customAlerts.length < before;
    if (removed) this.save();
    return removed;
  }

  /** List active (untriggered) custom alerts */
  getCustomAlerts(): PriceAlert[] {
    return this.store.customAlerts.filter((a) => !a.triggered);
  }

  /** Force-refresh prices now (used by voice tools) */
  async refreshNow(): Promise<AssetPrice[]> {
    await this.fetchPrices();
    return this.getPrices();
  }

  // ── Internal ─────────────────────────────────────────────────

  private async fetchPrices(): Promise<void> {
    const ids = Object.values(WATCHLIST).join(",");
    const url =
      `https://api.coingecko.com/api/v3/simple/price` +
      `?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        console.warn(`[Market Monitor] CoinGecko returned ${res.status}`);
        return;
      }

      const data = await res.json() as Record<
        string,
        { usd: number; usd_24h_change: number }
      >;

      const now = new Date().toISOString();
      const previousPrices = { ...this.store.prices };

      // Update store
      for (const [symbol, geckoId] of Object.entries(WATCHLIST)) {
        const coin = data[geckoId];
        if (!coin) continue;

        this.store.prices[symbol] = {
          symbol,
          price: coin.usd,
          changePercent24h: coin.usd_24h_change ?? 0,
          updatedAt: now,
        };
      }

      this.store.lastFetch = now;
      this.save();

      // Check alert conditions (respects quiet hours)
      if (!isQuietHours()) {
        this.checkDefaultAlerts(previousPrices);
        this.checkCustomAlerts();
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : "fetch failed";
      console.warn(`[Market Monitor] Price fetch failed: ${msg}`);
    }
  }

  /** Fire alert if any asset moves ≥ DEFAULT_CHANGE_PCT in 24h */
  private checkDefaultAlerts(previousPrices: Record<string, AssetPrice>): void {
    for (const [symbol, current] of Object.entries(this.store.prices)) {
      const prev = previousPrices[symbol];
      const pct = current.changePercent24h;

      // Only alert if the 24h change crossed the threshold since last check
      // (prev was under threshold, now over — prevents re-alerting every poll)
      const wasOver = prev ? Math.abs(prev.changePercent24h) >= DEFAULT_CHANGE_PCT : false;
      const isOver  = Math.abs(pct) >= DEFAULT_CHANGE_PCT;

      if (isOver && !wasOver) {
        const direction = pct >= 0 ? "surged" : "dropped";
        const message =
          `Sir, ${symbol} has ${direction} ${formatChange(pct)} in the last 24 hours. ` +
          `Currently at ${formatPrice(symbol, current.price)}.`;

        this.fireAlert(message, symbol);
      }
    }
  }

  /** Check custom price-target alerts */
  private checkCustomAlerts(): void {
    for (const alert of this.store.customAlerts) {
      if (alert.triggered) continue;

      const current = this.store.prices[alert.symbol];
      if (!current) continue;

      let triggered = false;
      let message = "";

      if (alert.type === "price_above" && current.price >= alert.threshold) {
        triggered = true;
        message =
          `${alert.symbol} has hit your price target. ` +
          `It is now at ${formatPrice(alert.symbol, current.price)}, ` +
          `above your alert of ${formatPrice(alert.symbol, alert.threshold)}.`;
      } else if (alert.type === "price_below" && current.price <= alert.threshold) {
        triggered = true;
        message =
          `${alert.symbol} has dropped below your price target. ` +
          `Currently at ${formatPrice(alert.symbol, current.price)}, ` +
          `below your alert of ${formatPrice(alert.symbol, alert.threshold)}.`;
      } else if (
        alert.type === "change_pct" &&
        Math.abs(current.changePercent24h) >= alert.threshold
      ) {
        triggered = true;
        message =
          `${alert.symbol} has moved ${formatChange(current.changePercent24h)} — ` +
          `your custom alert threshold of ${alert.threshold}% has been reached.`;
      }

      if (triggered) {
        alert.triggered = true;
        this.save();
        this.fireAlert(`Sir, ${message}`, alert.symbol);
      }
    }
  }

  private fireAlert(message: string, symbol: string): void {
    console.log(`[Market Monitor] Alert: ${message}`);
    for (const cb of this.alertCallbacks) {
      try {
        cb(message, symbol);
      } catch (e) {
        console.error("[Market Monitor] Alert callback error:", e);
      }
    }
  }

  private loadStore(): MarketStore {
    try {
      if (existsSync(STORE_FILE)) {
        return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
      }
    } catch {
      console.warn("[Market Monitor] Failed to load store, starting fresh");
    }
    return { prices: {}, customAlerts: [], lastFetch: "" };
  }

  private save(): void {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STORE_FILE, JSON.stringify(this.store, null, 2), "utf-8");
    } catch (error) {
      console.error("[Market Monitor] Failed to save:", error);
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────

export const marketMonitor = new MarketMonitor();
