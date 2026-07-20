"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { AreaChart, Area, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DataWindow } from "./DataWindow";

/* ── Animated Price Counter ───────────────────────────────── */
function PriceCounter({ value, prefix = "$" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === prev.current) return;
    const direction = value > prev.current ? "up" : "down";
    setFlash(direction);
    const start = prev.current;
    const diff = value - start;
    const t0 = performance.now();
    function tick(now: number) {
      const p = Math.min((now - t0) / 800, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + diff * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    prev.current = value;
    const id = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(id);
  }, [value]);

  const formatted = display >= 1000
    ? `${prefix}${display.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : `${prefix}${display.toFixed(display < 1 ? 4 : 2)}`;

  return (
    <span
      className={`font-mono font-bold text-sm tabular-nums transition-colors duration-300 ${
        flash === "up" ? "text-emerald-300" : flash === "down" ? "text-red-300" : "text-[#E3F2FD]"
      }`}
      style={flash ? { textShadow: flash === "up" ? "0 0 8px #22c55e60" : "0 0 8px #ef444460" } : {}}
    >
      {formatted}
    </span>
  );
}

/* ── Scan Line Animation ──────────────────────────────────── */
function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-px pointer-events-none z-10"
      style={{ background: "linear-gradient(90deg, transparent, #00D4FF30, transparent)" }}
      initial={{ top: 0 }}
      animate={{ top: "100%" }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
    />
  );
}

/* ── Types ────────────────────────────────────────────────── */
interface CoinData {
  symbol: string;
  price: number;
  change24h: number;
  sparkline: number[];
  volume: number;
}

function generateSparkline(base: number, volatility: number): number[] {
  const data: number[] = [];
  let val = base;
  for (let i = 0; i < 24; i++) {
    val += (Math.random() - 0.48) * volatility;
    data.push(Math.max(0, val));
  }
  return data;
}

function generateVolume(): number[] {
  return Array.from({ length: 12 }, () => Math.random() * 100);
}

/* ── Main Panel ───────────────────────────────────────────── */
export function CryptoPanel() {
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [status, setStatus] = useState<"online" | "loading" | "offline">("loading");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [elapsed, setElapsed] = useState("0s");

  // Tick the "last update" timer
  useEffect(() => {
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
      setElapsed(sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const sparkHistory = useRef<Record<string, number[]>>({});

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3001/api/market/prices");
      if (!res.ok) throw new Error("Market API unavailable");
      const data = await res.json();
      const prices: Array<{ symbol: string; price: number; changePercent24h: number }> = data.prices || [];

      const mapped: CoinData[] = prices.map((p) => {
        const sym = p.symbol.toUpperCase();
        // Build rolling sparkline from real price updates
        const prev = sparkHistory.current[sym] || [];
        const next = [...prev, p.price].slice(-24);
        sparkHistory.current[sym] = next;

        return {
          symbol: sym,
          price: p.price,
          change24h: p.changePercent24h || 0,
          sparkline: next.length > 1 ? next : generateSparkline(p.price, p.price * 0.01),
          volume: 0, // CoinGecko free tier doesn't return volume on this endpoint
        };
      });

      if (mapped.length > 0) {
        setCoins(mapped);
        setStatus("online");
      }
      setLastUpdate(new Date());
    } catch {
      // Fallback to simulated if orchestrator is down
      setCoins([
        { symbol: "XRP", price: 2.14 + (Math.random() - 0.5) * 0.08, change24h: 3.2 + (Math.random() - 0.5) * 2, sparkline: generateSparkline(2.1, 0.05), volume: 0 },
        { symbol: "XLM", price: 0.38 + (Math.random() - 0.5) * 0.02, change24h: -1.4 + (Math.random() - 0.5) * 2, sparkline: generateSparkline(0.38, 0.01), volume: 0 },
        { symbol: "HBAR", price: 0.19 + (Math.random() - 0.5) * 0.01, change24h: 5.7 + (Math.random() - 0.5) * 3, sparkline: generateSparkline(0.19, 0.008), volume: 0 },
        { symbol: "BTC", price: 87420 + (Math.random() - 0.5) * 1200, change24h: 1.8 + (Math.random() - 0.5) * 1.5, sparkline: generateSparkline(87000, 500), volume: 0 },
        { symbol: "ETH", price: 3210 + (Math.random() - 0.5) * 80, change24h: -0.6 + (Math.random() - 0.5) * 2, sparkline: generateSparkline(3200, 40), volume: 0 },
      ]);
      setStatus("offline");
      setLastUpdate(new Date());
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 30_000);
    return () => clearInterval(id);
  }, [fetchPrices]);

  const formatVol = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    return `${(v / 1e3).toFixed(0)}K`;
  };

  return (
    <DataWindow title="Market Feed" icon={<TrendingUp className="w-4 h-4" />} status={status} compact popoutPath="market-feed">
      <div className="relative overflow-hidden">
        <ScanLine />

        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {coins.map((coin, i) => (
            <motion.div
              key={coin.symbol}
              className="relative rounded bg-[#0a1a2a]/60 px-2 py-1.5 border border-[#1565C0]/20 hover:border-[#00A2FF]/40 transition-colors"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
            >
              <div className="flex items-center gap-2">
                {/* Symbol + Price */}
                <div className="w-20">
                  <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-[#4FC3F7] block">{coin.symbol}</span>
                  <PriceCounter value={coin.price} />
                </div>

                {/* Sparkline */}
                <div className="flex-1 h-7">
                  {coin.sparkline.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={coin.sparkline.map((v) => ({ v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id={`cg-${coin.symbol}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={coin.change24h >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={coin.change24h >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke={coin.change24h >= 0 ? "#22c55e" : "#ef4444"}
                          strokeWidth={1.5}
                          fill={`url(#cg-${coin.symbol})`}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Change + Volume */}
                <div className="w-16 text-right">
                  <span
                    className={`text-[11px] font-mono font-bold block ${
                      coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {coin.change24h >= 0 ? "+" : ""}
                    {coin.change24h.toFixed(1)}%
                  </span>
                  <span className="text-[8px] font-mono text-[#4FC3F7]">VOL {formatVol(coin.volume)}</span>
                </div>
              </div>

              {/* Tiny volume bar */}
              <div className="h-0.5 mt-1 bg-[#0a2a3a] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: coin.change24h >= 0 ? "#22c55e40" : "#ef444440" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (coin.volume / 30e9) * 100)}%` }}
                  transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 + i * 0.1 }}
                />
              </div>
            </motion.div>
          ))}

          {/* Footer: last update */}
          <div className="flex items-center justify-between pt-1 border-t border-[#1565C0]/20">
            <div className="flex items-center gap-1">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-[#00D4FF]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[8px] font-mono text-[#4FC3F7] uppercase">LIVE FEED</span>
            </div>
            <span className="text-[8px] font-mono text-[#4FC3F7] tabular-nums">UPDATED {elapsed} AGO</span>
          </div>
        </motion.div>
      </div>
    </DataWindow>
  );
}
