// Content Creation Tools — Phase 8.3
// LinkedIn posts, YouTube descriptions, content suggestions
// LinkedIn posting: draft shown first, then browser automation publishes
// Security: NEVER posts without Danny seeing the draft first

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

// ─── Danny's voice guide (for consistent LinkedIn tone) ──────────
const DANNY_VOICE = `
Danny's LinkedIn voice:
- Short sentences. Real talk. No fluff.
- Talks about AI, trades businesses, building in public, money, hustle
- Not corporate. Not polished. Sounds like a founder who works hard.
- Hooks are questions or bold statements, never "In today's digital world..."
- Ends with a simple question or CTA, never "Let me know your thoughts!"
- Max 5 short paragraphs. White space is good.
`.trim();

// ─── Tool definitions ─────────────────────────────────────────────

const tools: Tool[] = [

  // ── Draft LinkedIn post ────────────────────────────────────────
  {
    name: "draft_linkedin_post",
    description: "Draft a LinkedIn post in Danny's voice. Always shows draft to Danny before posting — never auto-posts.",
    category: "Content Creation",
    parameters: [
      { name: "topic", type: "string", description: "What the post is about (e.g. 'AI for trades businesses', 'cold outreach results')", required: true },
      { name: "angle", type: "string", description: "Optional angle or hook to use", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const topic = params.topic as string;
      const angle = params.angle as string | undefined;

      // The actual drafting happens via Claude (this tool surfaces the request with context)
      // JARVIS will use this tool output as context for its response
      return {
        toolCallId: "",
        success: true,
        data: JSON.stringify({
          instruction: "Draft a LinkedIn post for Danny",
          topic,
          angle: angle || null,
          voiceGuide: DANNY_VOICE,
          rules: [
            "Show the draft clearly before asking if he wants to post it",
            "Ask: 'Want me to post this, or shall I adjust anything?'",
            "Only call post_to_linkedin after explicit 'post it' confirmation",
            "Keep it under 300 words",
            "No hashtags in the body — put them at the end if needed (max 5)",
          ],
        }),
      };
    },
  },

  // ── Post to LinkedIn via browser ──────────────────────────────
  {
    name: "post_to_linkedin",
    description: "Post a pre-approved LinkedIn post via browser automation. Only call this after Danny has seen and approved the draft.",
    category: "Content Creation",
    parameters: [
      { name: "post_text", type: "string", description: "The exact post text to publish (already approved by Danny)", required: true },
      { name: "confirmed", type: "boolean", description: "Must be true — Danny has seen and approved this exact text", required: true },
    ],
    execute: async (params): Promise<ToolResult> => {
      if (!params.confirmed) {
        return { toolCallId: "", success: false, error: "Cannot post — Danny must approve the draft first. Show it to him and get confirmation." };
      }

      const postText = params.post_text as string;

      // Return instructions for browser automation
      // The browser_open / browser_type tools will be called by JARVIS in sequence
      return {
        toolCallId: "",
        success: true,
        data: JSON.stringify({
          instruction: "Post to LinkedIn via browser",
          steps: [
            { action: "browser_open", url: "https://www.linkedin.com/feed/" },
            { action: "browser_click", selector: "text=Start a post" },
            { action: "browser_type", selector: ".ql-editor", text: postText },
            { action: "browser_click", selector: "text=Post" },
            { action: "browser_click", selector: "text=Post" }, // confirm dialog
          ],
          post_text: postText,
          note: "Execute these browser steps in sequence. Confirm success with a screenshot.",
        }),
      };
    },
  },

  // ── Draft YouTube description ─────────────────────────────────
  {
    name: "draft_youtube_description",
    description: "Write an SEO-optimized YouTube description with hashtags for Danny's video.",
    category: "Content Creation",
    parameters: [
      { name: "video_title", type: "string", description: "The video title", required: true },
      { name: "video_topic", type: "string", description: "What the video covers", required: true },
      { name: "keywords", type: "string", description: "Key topics or keywords to target (comma-separated)", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const title   = params.video_title as string;
      const topic   = params.video_topic as string;
      const keywords = params.keywords as string | undefined;

      return {
        toolCallId: "",
        success: true,
        data: JSON.stringify({
          instruction: "Write a YouTube description",
          title,
          topic,
          keywords: keywords || "",
          rules: [
            "First 2 sentences must contain the main keyword (appear above the fold)",
            "Include timestamps section if video is over 5 minutes",
            "Add 3-5 relevant links section (website, LinkedIn, Instagram)",
            "End with 10 hashtags — mix of broad (#AI, #SmallBusiness) and niche (#AIForTrades, #WavelengthAI)",
            "Keep total length 200-500 words",
            "Write in Danny's voice — direct, real, no corporate speak",
          ],
        }),
      };
    },
  },

  // ── Suggest content topics ────────────────────────────────────
  {
    name: "suggest_content_topics",
    description: "Suggest 3 LinkedIn or YouTube content topics based on current news and Danny's business context.",
    category: "Content Creation",
    parameters: [
      { name: "platform", type: "string", description: "linkedin or youtube", required: false },
      { name: "niche", type: "string", description: "Topic niche focus (default: AI for trades businesses)", required: false },
    ],
    execute: async (params): Promise<ToolResult> => {
      const platform = (params.platform as string | undefined) || "linkedin";
      const niche = (params.niche as string | undefined) || "AI for trades businesses in Fraser Valley";

      return {
        toolCallId: "",
        success: true,
        data: JSON.stringify({
          instruction: "Suggest 3 content topics",
          platform,
          niche,
          context: {
            business: "Wavelength AI — AI agency for trades businesses",
            goal: "Position Danny as the go-to AI guy for trades in Fraser Valley",
            audience: "Plumbers, electricians, HVAC, roofers, contractors in BC",
            currentFocus: "Getting first client, building credibility, showing ROI",
          },
          format: "For each topic: 1) Hook line 2) Why it will perform 3) Key point to make",
          rules: [
            "Use web_search to find trending AI/trades news first",
            "Make topics timely and specific — not generic",
            "One topic should be vulnerable/personal (builds trust)",
            "One topic should be educational (establishes authority)",
            "One topic should be results-focused (drives leads)",
          ],
        }),
      };
    },
  },
];

export function registerContentTools(): void {
  tools.forEach((t) => toolRegistry.register(t));
}
