# Wavelength Prospector Agent

Finds local businesses on Google Maps with no website, builds them one with Claude, deploys it live on Netlify, then cold-pitches it for $1,000.

## Pipeline

```
Google Places API  →  Claude builds site  →  Netlify deploy  →  Gmail cold email
```

## Setup (5 minutes)

### 1. Install dependencies
```
pip install anthropic python-dotenv
```

### 2. Fill in .env
Open `agents/prospector/.env` and paste in:

| Key | Where to get it |
|-----|-----------------|
| `ANTHROPIC_API_KEY` | Already in your orchestrator .env |
| `TAVILY_API_KEY` | Already in your orchestrator .env |
| `GOOGLE_MAPS_API_KEY` | console.cloud.google.com → APIs → Places API → Create key |
| `GMAIL_USER` | Your Gmail address |
| `GMAIL_APP_PASSWORD` | myaccount.google.com/apppasswords (NOT your real password) |
| `NETLIFY_AUTH_TOKEN` | app.netlify.com → User Settings → Applications → New token |

Set your target city, radius, and business types at the bottom of .env.

### 3. Run it

```bash
cd agents/prospector

# Full pipeline (prospect → build → deploy → email)
python run_agent.py

# Dry run first — builds everything but doesn't send emails
python run_agent.py --dry-run

# Step by step
python run_agent.py --step prospect   # find leads
python run_agent.py --step build      # build sites
python run_agent.py --step deploy     # push to Netlify
python run_agent.py --step email --dry-run   # preview emails
python run_agent.py --step email      # send for real
```

## Output

- `output/leads/` — JSON files with all lead data + status tracking
- `output/sites/` — Generated HTML files per business
- `output/emails/` — HTML preview of every email sent

## The Pitch

Subject: **"I built [Business Name] a website — it's already live"**

The email shows them the live URL first, then offers it for **$1,000 one-time** with no monthly fees.
This is the strongest cold email format: the value is already delivered before they pay anything.

## Economics

- 20 leads/run × ~40% open rate × ~10% reply rate = **2 conversations per run**
- Each conversation closes at ~50% = **1 sale per run = $1,000**
- Claude API cost per site: ~$0.15 (Opus) or ~$0.02 (Haiku)
- Total cost per run: ~$3 in API + your time to set it up
