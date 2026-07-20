"use client";

import { Panel, usePoll, deckTool, OfflineNote } from "./deck-lib";

// Markets glance via Battle Station. Shape-tolerant on purpose: renders any
// array of {symbol, price, change}-ish rows it finds; if the station is off it
// says so instead of inventing numbers.

type Row = { sym: string; price?: string; chg?: number };

function extractRows(data: Record<string, unknown>): Row[] {
  const candidates = ["bags", "crypto", "coins", "tickers", "watchlist"];
  for (const key of candidates) {
    const arr = data[key];
    if (Array.isArray(arr) && arr.length) {
      return arr.slice(0, 6).map((r: Record<string, unknown>) => {
        const sym = String(r.symbol ?? r.sym ?? r.name ?? "?").toUpperCase();
        const priceRaw = r.price ?? r.usd ?? r.last;
        const chgRaw = r.change24h ?? r.change ?? r.chg ?? r.pct;
        return {
          sym,
          price:
            typeof priceRaw === "number"
              ? priceRaw >= 100
                ? priceRaw.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : priceRaw.toFixed(4)
              : undefined,
          chg: typeof chgRaw === "number" ? chgRaw : undefined,
        };
      });
    }
  }
  return [];
}

export function MarketCard() {
  const { data } = usePoll(
    () => deckTool<Record<string, unknown>>("market_snapshot"),
    60_000
  );

  if (!data) return null;

  if (!data.success) {
    return (
      <Panel title="Markets">
        <OfflineNote text='Battle Station offline on :9999 — ask FRIDAY to "launch battle-station" or run its START.bat.' />
      </Panel>
    );
  }

  const rows = extractRows(data.data ?? {});
  const message = typeof data.data?.message === "string" ? data.data.message : null;

  return (
    <Panel title="Markets">
      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.sym} className="flex items-baseline gap-2 font-deckmono text-[11px]">
              <span className="text-deck-ink">{r.sym}</span>
              <span className="ml-auto text-deck-dim">{r.price ?? ""}</span>
              {r.chg !== undefined && (
                <span className={r.chg >= 0 ? "text-deck-ok" : "text-deck-alert"}>
                  {r.chg >= 0 ? "+" : ""}
                  {r.chg.toFixed(1)}%
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <OfflineNote text={message ?? "Battle Station reachable — no watchlist rows in snapshot."} />
      )}
    </Panel>
  );
}
