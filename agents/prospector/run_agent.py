"""
run_agent.py — master orchestrator. Runs the full pipeline end-to-end:
  1. Prospect  → find businesses with no website
  2. Build     → Claude generates a custom HTML site per business
  3. Deploy    → push each site live to Netlify
  4. Email     → find owner email, send the $1,000 pitch

Usage:
    python run_agent.py                          # full pipeline, real emails
    python run_agent.py --dry-run                # build + deploy but don't send
    python run_agent.py --step prospect          # only prospect
    python run_agent.py --step build             # only build sites
    python run_agent.py --step deploy            # only deploy
    python run_agent.py --step email --dry-run   # preview emails
    python run_agent.py --leads path/to/file.json  # use existing leads file
"""

import argparse, sys, time
from pathlib import Path

def banner(text):
    bar = "═" * (len(text) + 4)
    print(f"\n╔{bar}╗")
    print(f"║  {text}  ║")
    print(f"╚{bar}╝\n")

def run_full(args):
    from prospector   import find_no_website_businesses, save_leads, load_latest_leads
    from site_builder import build_sites_for_leads
    from deployer     import deploy_all
    from emailer      import email_all
    import os
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")

    # ── Step 1: Prospect ─────────────────────────────
    if args.step in (None, "prospect"):
        banner("STEP 1 — PROSPECTING")
        if args.leads:
            leads_path = Path(args.leads)
            print(f"Using existing leads file: {leads_path}")
        else:
            city   = os.environ.get("TARGET_CITY", "Vancouver, BC")
            types  = [t.strip() for t in os.environ.get("TARGET_TYPES", "restaurant,hair_care").split(",")]
            radius = int(os.environ.get("TARGET_RADIUS_KM", 10))
            maxl   = int(os.environ.get("MAX_LEADS_PER_RUN", 20))
            leads  = find_no_website_businesses(city, types, radius, maxl)
            if not leads:
                print("No leads found. Exiting.")
                sys.exit(0)
            leads_path = save_leads(leads, city)
        if args.step == "prospect":
            return

    else:
        leads_path, _ = load_latest_leads()
        print(f"Using leads file: {leads_path}")

    # ── Step 2: Build sites ──────────────────────────
    if args.step in (None, "build"):
        banner("STEP 2 — BUILDING SITES WITH CLAUDE")
        build_sites_for_leads(leads_path)
        if args.step == "build":
            return

    # ── Step 3: Deploy to Netlify ────────────────────
    if args.step in (None, "deploy"):
        banner("STEP 3 — DEPLOYING TO NETLIFY")
        deploy_all(leads_path)
        if args.step == "deploy":
            return

    # ── Step 4: Email ────────────────────────────────
    if args.step in (None, "email"):
        banner("STEP 4 — COLD EMAILING OWNERS")
        email_all(leads_path, dry_run=args.dry_run)

    # ── Summary ──────────────────────────────────────
    banner("PIPELINE COMPLETE")
    import json
    with open(leads_path, encoding="utf-8") as f:
        leads = json.load(f)

    counts = {}
    for l in leads:
        s = l.get("status", "unknown")
        counts[s] = counts.get(s, 0) + 1

    print("Status breakdown:")
    for status, count in sorted(counts.items()):
        print(f"  {status:25s} {count}")

    deployed = [l for l in leads if l.get("site_url")]
    emailed  = [l for l in leads if l.get("email_sent")]
    print(f"\n  Sites deployed : {len(deployed)}")
    print(f"  Emails sent    : {len(emailed)}")
    print(f"\n  Leads file     : {leads_path}")

    if deployed:
        print("\n  Live sites:")
        for l in deployed[:10]:
            sent = "✉" if l.get("email_sent") else " "
            print(f"  {sent} {l['name']:40s} {l['site_url']}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wavelength Prospector Agent")
    parser.add_argument("--step",     choices=["prospect","build","deploy","email"], help="Run only one step")
    parser.add_argument("--leads",    help="Path to existing leads JSON file")
    parser.add_argument("--dry-run",  action="store_true", help="Preview emails without sending")
    args = parser.parse_args()
    run_full(args)
