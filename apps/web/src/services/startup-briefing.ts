// Startup Briefing Service
// Fetches crypto prices, stocks, weather, emails, and todos for morning briefing

import { userConfig } from "@/config/user-config";

export interface CryptoPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent: number;
}

export interface StockPrice {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap?: string;
}

export interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  location: string;
}

export interface EmailSummary {
  unreadCount: number;
  importantCount: number;
  latestSubject?: string;
  latestFrom?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  dueDate?: string;
}

export interface StartupBriefing {
  timestamp: Date;
  crypto: CryptoPrice[];
  stocks: StockPrice[];
  weather: WeatherData | null;
  emails: EmailSummary;
  todos: TodoItem[];
  greeting: string;
}

// Fetch crypto prices from CoinGecko (free, no API key needed)
export async function fetchCryptoPrices(): Promise<CryptoPrice[]> {
  const symbols = userConfig.preferences.cryptoWatchlist;
  const coinIds: Record<string, string> = {
    XRP: "ripple",
    XLM: "stellar",
    HBAR: "hedera-hashgraph",
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    ADA: "cardano",
    DOGE: "dogecoin",
    DOT: "polkadot",
    AVAX: "avalanche-2",
    MATIC: "matic-network",
    LINK: "chainlink",
    UNI: "uniswap",
    ATOM: "cosmos",
    LTC: "litecoin",
  };

  try {
    const ids = symbols.map(s => coinIds[s] || s.toLowerCase()).join(",");
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );

    if (!response.ok) throw new Error("Failed to fetch crypto prices");

    const data = await response.json();

    return symbols.map(symbol => {
      const id = coinIds[symbol] || symbol.toLowerCase();
      const coinData = data[id];
      return {
        symbol,
        name: id,
        price: coinData?.usd || 0,
        change24h: coinData?.usd_24h_change || 0,
        changePercent: coinData?.usd_24h_change || 0,
      };
    });
  } catch (error) {
    console.error("Error fetching crypto:", error);
    return symbols.map(symbol => ({
      symbol,
      name: symbol,
      price: 0,
      change24h: 0,
      changePercent: 0,
    }));
  }
}

// Fetch stock prices using Yahoo Finance via a proxy or free API
export async function fetchStockPrices(): Promise<StockPrice[]> {
  const symbols = userConfig.preferences.stockWatchlist;

  // Company name mapping
  const companyNames: Record<string, string> = {
    AAPL: "Apple",
    TSLA: "Tesla",
    NVDA: "NVIDIA",
    MSFT: "Microsoft",
    GOOGL: "Alphabet",
    AMZN: "Amazon",
    META: "Meta",
    AMD: "AMD",
    INTC: "Intel",
    NFLX: "Netflix",
    DIS: "Disney",
    V: "Visa",
    JPM: "JPMorgan",
    BA: "Boeing",
    COIN: "Coinbase",
    GME: "GameStop",
    AMC: "AMC",
    SPY: "S&P 500 ETF",
    QQQ: "Nasdaq ETF",
  };

  try {
    // Using Yahoo Finance query API (free, no key needed)
    // Note: This may have CORS issues in browser, works in Node/server
    const symbolList = symbols.join(",");
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolList}`
    );

    if (!response.ok) {
      // Fallback: Try alternative free API
      return await fetchStockPricesFallback(symbols, companyNames);
    }

    const data = await response.json();
    const quotes = data.quoteResponse?.result || [];

    return symbols.map(symbol => {
      const quote = quotes.find((q: { symbol: string }) => q.symbol === symbol);
      return {
        symbol,
        name: companyNames[symbol] || symbol,
        price: quote?.regularMarketPrice || 0,
        change: quote?.regularMarketChange || 0,
        changePercent: quote?.regularMarketChangePercent || 0,
        marketCap: formatMarketCap(quote?.marketCap),
      };
    });
  } catch (error) {
    console.error("Error fetching stocks:", error);
    return await fetchStockPricesFallback(symbols, companyNames);
  }
}

// Fallback stock fetcher using Finnhub (free tier available)
async function fetchStockPricesFallback(
  symbols: string[],
  companyNames: Record<string, string>
): Promise<StockPrice[]> {
  // Return placeholder data - user can add API key for real data
  // To enable: Get free API key from finnhub.io and add to env
  return symbols.map(symbol => ({
    symbol,
    name: companyNames[symbol] || symbol,
    price: 0,
    change: 0,
    changePercent: 0,
    marketCap: undefined,
  }));
}

function formatMarketCap(value: number | undefined): string | undefined {
  if (!value) return undefined;
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(0)}`;
}

// Fetch weather (using Open-Meteo - free, no API key)
export async function fetchWeather(): Promise<WeatherData | null> {
  try {
    // Default to New York if no location set - user should update config
    const lat = 40.7128;
    const lon = -74.0060;

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
    );

    if (!response.ok) throw new Error("Failed to fetch weather");

    const data = await response.json();
    const current = data.current;

    const weatherCodes: Record<number, string> = {
      0: "Clear",
      1: "Mainly Clear",
      2: "Partly Cloudy",
      3: "Overcast",
      45: "Foggy",
      48: "Foggy",
      51: "Light Drizzle",
      53: "Drizzle",
      55: "Heavy Drizzle",
      61: "Light Rain",
      63: "Rain",
      65: "Heavy Rain",
      71: "Light Snow",
      73: "Snow",
      75: "Heavy Snow",
      95: "Thunderstorm",
    };

    return {
      temp: Math.round(current.temperature_2m),
      condition: weatherCodes[current.weather_code] || "Unknown",
      icon: getWeatherIcon(current.weather_code),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      location: userConfig.location.city,
    };
  } catch (error) {
    console.error("Error fetching weather:", error);
    return null;
  }
}

function getWeatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌧️";
  if (code <= 65) return "🌧️";
  if (code <= 75) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

// Mock email check - would need real integration
export async function fetchEmailSummary(): Promise<EmailSummary> {
  // TODO: Integrate with Gmail/Outlook API
  return {
    unreadCount: 0,
    importantCount: 0,
    latestSubject: undefined,
    latestFrom: undefined,
  };
}

// Mock todo list - connects to localStorage
export async function fetchTodos(): Promise<TodoItem[]> {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("JARVIS-todos");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
  }
  return [];
}

// Save todo to local storage
export function saveTodos(todos: TodoItem[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("JARVIS-todos", JSON.stringify(todos));
  }
}

// Add a new todo
export function addTodo(title: string, priority: "high" | "medium" | "low" = "medium"): TodoItem {
  const todo: TodoItem = {
    id: Date.now().toString(),
    title,
    priority,
  };

  const todos = JSON.parse(localStorage.getItem("JARVIS-todos") || "[]");
  todos.push(todo);
  saveTodos(todos);

  return todo;
}

// Get full startup briefing
export async function getStartupBriefing(): Promise<StartupBriefing> {
  const [crypto, stocks, weather, emails, todos] = await Promise.all([
    fetchCryptoPrices(),
    fetchStockPrices(),
    fetchWeather(),
    fetchEmailSummary(),
    fetchTodos(),
  ]);

  return {
    timestamp: new Date(),
    crypto,
    stocks,
    weather,
    emails,
    todos,
    greeting: generateBriefingGreeting(crypto, stocks, weather, emails, todos),
  };
}

// Generate a natural language briefing
function generateBriefingGreeting(
  crypto: CryptoPrice[],
  stocks: StockPrice[],
  weather: WeatherData | null,
  emails: EmailSummary,
  todos: TodoItem[]
): string {
  const parts: string[] = [];

  // Crypto summary
  if (crypto.length > 0 && crypto.some(c => c.price > 0)) {
    const movers = crypto
      .filter(c => c.price > 0)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 2);

    if (movers.length > 0) {
      const cryptoSummary = movers
        .map(c => {
          const direction = c.changePercent >= 0 ? "up" : "down";
          return `${c.symbol} ${direction} ${Math.abs(c.changePercent).toFixed(1)}%`;
        })
        .join(", ");
      parts.push(`Crypto: ${cryptoSummary}.`);
    }
  }

  // Stocks summary
  if (stocks.length > 0 && stocks.some(s => s.price > 0)) {
    const movers = stocks
      .filter(s => s.price > 0)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 2);

    if (movers.length > 0) {
      const stockSummary = movers
        .map(s => {
          const direction = s.changePercent >= 0 ? "up" : "down";
          return `${s.symbol} ${direction} ${Math.abs(s.changePercent).toFixed(1)}%`;
        })
        .join(", ");
      parts.push(`Stocks: ${stockSummary}.`);
    }
  }

  // Weather
  if (weather) {
    parts.push(`Weather: ${weather.temp}°F, ${weather.condition.toLowerCase()}.`);
  }

  // Emails
  if (emails.unreadCount > 0) {
    parts.push(`${emails.unreadCount} unread email${emails.unreadCount > 1 ? "s" : ""}.`);
  }

  // Todos
  if (todos.length > 0) {
    const highPriority = todos.filter(t => t.priority === "high").length;
    if (highPriority > 0) {
      parts.push(`${highPriority} high-priority task${highPriority > 1 ? "s" : ""}.`);
    } else {
      parts.push(`${todos.length} task${todos.length > 1 ? "s" : ""} today.`);
    }
  }

  return parts.join(" ");
}
