"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { DataWindow, Stat } from "./DataWindow";

interface CoinData {
  symbol: string;
  price: number;
  change24h: number;
  sparkline: number[];
}

const COINS: CoinData[] = [
  { symbol: "XRP", price: 0, change24h: 0, sparkline: [] },
  { symbol: "XLM", price: 0, change24h: 0, sparkline: [] },
  { symbol: "HBAR", price: 0, change24h: 0, sparkline: [] },
  { symbol: "BTC", price: 0, change24h: 0, sparkline: [] },
  { symbol: "ETH", price: 0, change24h: 0, sparkline: [] },
];

// Generate placeholder sparkline data
function generateSparkline(base: number, volatility: number): number[] {
  const data: number[] = [];
  let val = base;
  for (let i = 0; i < 24; i++) {
    val += (Math.random() - 0.48) * volatility;
    data.push(Math.max(0, val));
  }
  return data;
}

export function CryptoPanel() {
  const [coins, setCoins] = useState<CoinData[]>(COINS);
  const [status, setStatus] = useState<"online" | "loading" | "offline">("loading");

  useEffect(() => {
    async function fetchPrices() {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "__internal_crypto_prices" }),
        });
        // For now, use simulated data until market-monitor API is exposed
        setCoins([
          { symbol: "XRP", price: 2.14, change24h: 3.2, sparkline: generateSparkline(2.1, 0.05) },
          { symbol: "XLM", price: 0.38, change24h: -1.4, sparkline: generateSparkline(0.38, 0.01) },
          { symbol: "HBAR", price: 0.19, change24h: 5.7, sparkline: generateSparkline(0.19, 0.008) },
          { symbol: "BTC", price: 87420, change24h: 1.8, sparkline: generateSparkline(87000, 500) },
          { symbol: "ETH", price: 3210, change24h: -0.6, sparkline: generateSparkline(3200, 40) },
        ]);
        setStatus("online");
      } catch {
        setStatus("offline");
      }
    }
    fetchPrices();
    const interval = setInterval(fetchPrices, 300_000); // 5 min
    return () => clearInterval(interval);
  }, []);

  return (
    <DataWindow
      title="Market Feed"
      icon={<TrendingUp className="w-4 h-4" />}
      status={status}
      compact
    >
      <div className="space-y-2">
        {coins.map((coin) => (
          <div key={coin.symbol} className="flex items-center gap-2">
            <div className="w-16">
              <Stat
                label={coin.symbol}
                value={coin.price >= 1000 ? `${(coin.price / 1000).toFixed(1)}K` : `$${coin.price.toFixed(2)}`}
                small
              />
            </div>
            <div className="flex-1 h-6">
              {coin.sparkline.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={coin.sparkline.map((v) => ({ v }))}>
                    <defs>
                      <linearGradient id={`grad-${coin.symbol}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={coin.change24h >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={coin.change24h >= 0 ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={coin.change24h >= 0 ? "#22c55e" : "#ef4444"}
                      strokeWidth={1.5}
                      fill={`url(#grad-${coin.symbol})`}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <span
              className={`text-[10px] font-mono w-12 text-right ${
                coin.change24h >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {coin.change24h >= 0 ? "+" : ""}
              {coin.change24h.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </DataWindow>
  );
}
