// User Configuration for JARVIS
// Personalization settings for Danny

export interface UserConfig {
  name: string;
  nicknames: string[];
  location: {
    city: string;
    state: string;
    country: string;
    timezone: string;
  };
  preferences: {
    cryptoWatchlist: string[];
    stockWatchlist: string[];
    emailProvider: string;
    workspaceName: string;
  };
}

export const userConfig: UserConfig = {
  name: "Daniel",
  nicknames: ["Dan", "Danny", "Sir", "Boss", "Champ", "Creator"],
  location: {
    city: "Your City", // Update this
    state: "Your State",
    country: "US",
    timezone: "America/New_York", // Update to your timezone
  },
  preferences: {
    // Crypto watchlist - add/remove symbols as needed
    cryptoWatchlist: ["XRP", "XLM", "HBAR"],
    // Stock watchlist - add/remove ticker symbols as needed
    stockWatchlist: ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL"],
    emailProvider: "gmail", // or "outlook", "yahoo"
    workspaceName: "Dancave",
  },
};

// Get random nickname for greetings
export function getRandomNickname(): string {
  const nicknames = userConfig.nicknames;
  return nicknames[Math.floor(Math.random() * nicknames.length)];
}

// Get time-appropriate greeting
export function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Burning the midnight oil";
}

// Format greeting with random nickname
export function getPersonalizedGreeting(): string {
  const greeting = getTimeGreeting();
  const nickname = getRandomNickname();
  return `${greeting}, ${nickname}`;
}
