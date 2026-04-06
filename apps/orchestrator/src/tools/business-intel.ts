// Business Intelligence Tools — Phase 8.4
// Wavelength Solutions metrics: MRR, leads, goal progress
// Stored in data/business.json
// Displayed in the HUD right panel

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { config } from "../config/index.js";

// ─── Storage ──────────────────────────────────────────────────────

const DATA_DIR = join(
  process.env.USERPROFILE || process.env.HOME || "C:\\Users\\12368",
  "jarvis", "apps", "orchestrator", "data"
);
const BUSINESS_FILE = join(DATA_DIR, "business.json");

const DAILY_GOAL = 500; // $500/day target

interface LeadEntry {
  date: string;
  name: string;
  source: string;
  status: "new" | "contacted" | "proposal" | "closed" | "lost";
  value?: number;
  notes?: string;
}

interface BusinessStore {
  mrr: number;
  mrrHistory: Array<{ date: string; mrr: number }>;
  leads: LeadEntry[];
  clients: Array<{ name: string; mrr: number; startDate: string; active: boolean }>;
  lastUpdated: string;
}

function loadStore(): BusinessStore {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(BUSINESS_FILE)) {
    const defaults: BusinessStore = {
      mrr: 0,
      mrrHistory: [],
      leads: [],
      clients: [],
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(BUSINESS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try {
    return JSON.parse(readFileSync(BUSINESS_FILE, "utf8"));
  } catch {
    return { mrr: 0, mrrHistory: [], leads: [], clients: [], lastUpdated: new Date().toISOString() };
  }
}

function saveStore(store: BusinessStore): void {
  store.lastUpdated = new Date().toISOString();
  writeFileSync(BUSINESS_FILE, JSON.stringify(store, null, 2));
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Tools ────────────────────────────────────────────────────────

const tools: Tool[] = [

  // ── Set MRR ───────────────────────────────────────────────────
  {
    name: "business_set_mrr",
    description: "Update Wavelength's MRR (monthly recurring revenue). Say 'JARVIS, update MRR to $X'.",
    category: "Business Intelligence",
    parameters: [
      { name: "amount", type: "number", description: "New MRR in dollars", required: true },
    ],
    execute: async (params): Promise<ToolResult> => {
      const amount = params.amount as number;
      if (amount < 0) return { success: false, error: "MRR cannot be negative" };

      const store = loadStore();
      const prev = store.mrr;
      store.mrr = amount;
      store.mrrHistory.push({ date: today(), mrr: amount });
      store.mrrHistory = store.mrrHistory.slice(-365);
      saveStore(store);

      const dailyEquiv = (amount / 30).toFixed(0);
      const toGoal = Math.max(0, DAILY_GOAL - amount / 30);
      const diff = amount - prev;
      const changeMsg = diff !== 0 ? ` (${diff >= 0 ? "+" : ""}$${diff} from previous)` : "";

      return {
        success: true,
        data: `MRR updated to $${amount}${changeMsg}. That is ~$${dailyEquiv}/day. ${
          toGoal > 0
            ? `$${toGoal.toFixed(0)}/day to reach the $500/day goal.`
            : "Daily goal achieved, sir."
        }`,
      };
    },
  },

  // ── Add lead ──────────────────────────────────────────────────
  {
    name: "business_add_lead",
    description: "Add a new lead to the Wavelength pipeline.",
    category: "Business Intelligence",
    parameters: [
      { name: "name", type: "string", description: "Business or person name", required: true },
      { name: "source", type: "string", description: "Where the lead came from (LinkedIn, referral, cold outreach, etc.)", required: false },
      { name: "value", type: "number", description: "Estimated deal value per month", required: false },
      { name: "notes", type: "string", description: "Any relevant notes", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const lead: LeadEntry = {
        date:   today(),
        name:   params.name as string,
        source: (params.source as string | undefined) || "unknown",
        status: "new",
        value:  params.value as number | undefined,
        notes:  params.notes as string | undefined,
      };

      const store = loadStore();
      store.leads.push(lead);
      saveStore(store);

      const activePipeline = store.leads.filter((l) => !["closed", "lost"].includes(l.status));
      return {
        success: true,
        data: `Lead added: ${lead.name} (${lead.source}). Pipeline now has ${activePipeline.length} active lead${activePipeline.length !== 1 ? "s" : ""}.`,
      };
    },
  },

  // ── Update lead status ────────────────────────────────────────
  {
    name: "business_update_lead",
    description: "Update the status of a lead in the pipeline.",
    category: "Business Intelligence",
    parameters: [
      { name: "name", type: "string", description: "Lead name to find (partial match ok)", required: true },
      { name: "status", type: "string", description: "new, contacted, proposal, closed, lost", required: true },
      { name: "notes", type: "string", description: "Update notes", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const searchName = (params.name as string).toLowerCase();
      const newStatus = params.status as LeadEntry["status"];
      const validStatuses: LeadEntry["status"][] = ["new", "contacted", "proposal", "closed", "lost"];
      if (!validStatuses.includes(newStatus)) {
        return { success: false, error: `Invalid status. Use: ${validStatuses.join(", ")}` };
      }

      const store = loadStore();
      const lead = store.leads.findLast((l) => l.name.toLowerCase().includes(searchName));
      if (!lead) return { success: false, error: `Lead "${params.name}" not found` };

      const prev = lead.status;
      lead.status = newStatus;
      if (params.notes) lead.notes = params.notes as string;
      saveStore(store);

      const emoji = newStatus === "closed" ? " Let's go." : newStatus === "lost" ? " On to the next." : "";
      return {
        success: true,
        data: `${lead.name}: ${prev} → ${newStatus}.${emoji}`,
      };
    },
  },

  // ── Get metrics ───────────────────────────────────────────────
  {
    name: "business_get_metrics",
    description: "Get Wavelength business metrics: MRR, pipeline, leads today, goal progress.",
    category: "Business Intelligence",
    parameters: [],
    execute: async (): Promise<ToolResult> => {
      const store = loadStore();
      const todayStr = today();

      const activePipeline = store.leads.filter((l) => !["closed", "lost"].includes(l.status));
      const closedClients  = store.leads.filter((l) => l.status === "closed");
      const leadsToday     = store.leads.filter((l) => l.date === todayStr);
      const dailyEquiv     = store.mrr / 30;
      const progress       = Math.min(100, (dailyEquiv / DAILY_GOAL) * 100);

      const pipelineValue = activePipeline.reduce((sum, l) => sum + (l.value || 0), 0);

      return {
        success: true,
        data: JSON.stringify({
          mrr: store.mrr,
          dailyEquivalent: Math.round(dailyEquiv),
          dailyGoal: DAILY_GOAL,
          goalProgress: `${progress.toFixed(0)}%`,
          activeLeads: activePipeline.length,
          pipelineValue,
          closedClients: closedClients.length,
          leadsToday: leadsToday.length,
          lastUpdated: store.lastUpdated,
        }),
      };
    },
  },

  // ── Check Netlify leads ───────────────────────────────────────
  {
    name: "business_check_netlify_leads",
    description: "Check Netlify form submissions for new leads from the Wavelength website.",
    category: "Business Intelligence",
    parameters: [],
    execute: async (): Promise<ToolResult> => {
      if (!config.netlify.authToken) {
        return { success: false, error: "NETLIFY_AUTH_TOKEN not configured" };
      }

      try {
        // Get sites first
        const sitesRes = await fetch("https://api.netlify.com/api/v1/sites", {
          headers: { Authorization: `Bearer ${config.netlify.authToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!sitesRes.ok) return { success: false, error: "Netlify API error" };
        const sites = await sitesRes.json() as Array<{ id: string; name: string }>;

        const wavelengthSite = sites.find((s) =>
          s.name.toLowerCase().includes("wavelength") || s.name.toLowerCase().includes("wave")
        );
        if (!wavelengthSite) return { success: true, data: "No Wavelength site found on Netlify." };

        // Get form submissions
        const formsRes = await fetch(
          `https://api.netlify.com/api/v1/sites/${wavelengthSite.id}/submissions?per_page=20`,
          {
            headers: { Authorization: `Bearer ${config.netlify.authToken}` },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!formsRes.ok) return { success: false, error: "Could not fetch form submissions" };

        const submissions = await formsRes.json() as Array<{
          created_at: string;
          data: Record<string, string>;
        }>;

        if (submissions.length === 0) {
          return { success: true, data: "No form submissions found on the Wavelength site." };
        }

        // Show last 5
        const recent = submissions.slice(0, 5).map((s) => {
          const name  = s.data.name || s.data.Name || "Unknown";
          const email = s.data.email || s.data.Email || "";
          const date  = new Date(s.created_at).toLocaleDateString();
          return `${name}${email ? ` (${email})` : ""} — ${date}`;
        });

        return {
          success: true,
          data: `${submissions.length} total submission${submissions.length !== 1 ? "s" : ""} from Wavelength site. Recent: ${recent.join("; ")}`,
        };
      } catch (e) {
        return { success: false, error: `Netlify check failed: ${(e as Error).message}` };
      }
    },
  },
];

export function registerBusinessIntelTools(): void {
  tools.forEach((t) => toolRegistry.register(t));
}
