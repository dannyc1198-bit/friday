"""
emailer.py — finds the owner's email via Tavily, then sends a cold pitch.
The pitch: "I already built your site. It's live. It's yours for $1,000."
"""

import os, json, re, ssl, smtplib, urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

TAVILY_KEY = os.environ["TAVILY_API_KEY"]
GMAIL_USER = os.environ["GMAIL_USER"]
GMAIL_PASS = os.environ["GMAIL_APP_PASSWORD"]
FROM_NAME  = os.environ.get("FROM_NAME", "Danny")
FROM_CO    = os.environ.get("FROM_COMPANY", "Wavelength Solutions")
PRICE      = os.environ.get("SITE_PRICE", "$1,000")
OUTPUT_DIR = Path(__file__).parent / "output" / "emails"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CTX = ssl.create_default_context()

# ── Email hunt ────────────────────────────────────────────────────

def find_email_tavily(business_name: str, city: str) -> str | None:
    """Use Tavily to search for the owner's contact email."""
    import json as _json
    query = f'"{business_name}" {city} contact email owner'
    payload = _json.dumps({
        "api_key": TAVILY_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": True,
    }).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=10) as r:
            data = _json.loads(r.read())
    except Exception:
        return None

    # Scrape all text for email patterns
    combined = data.get("answer", "") + " ".join(
        r.get("content", "") for r in data.get("results", [])
    )
    emails = re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', combined)
    # Filter out generic/social-media emails
    blocked = {"example.com","sentry.io","wixpress.com","squarespace.com","wordpress.com","googleapis.com"}
    for e in emails:
        domain = e.split("@")[-1].lower()
        if domain not in blocked and "noreply" not in e.lower():
            return e.lower()
    return None

# ── Email templates ───────────────────────────────────────────────

SUBJECT = "I built {name} a website — it's already live"

HTML_BODY = """
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,serif;background:#f9f9f9;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:36px 40px;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

    <p style="font-size:16px;color:#111;margin-top:0">Hi {first_name},</p>

    <p style="font-size:15px;color:#333;line-height:1.7">
      My name is {from_name} — I help local businesses in {city} get online
      quickly without the usual hassle.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7">
      I noticed <strong>{name}</strong> doesn't have a website yet. You're leaving
      customers on the table every day — people Google a business before they ever
      walk in the door.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7">
      So I went ahead and built one for you. <strong>It's already live right now:</strong>
    </p>

    <div style="text-align:center;margin:28px 0">
      <a href="{site_url}" target="_blank"
         style="display:inline-block;background:#1a1a2e;color:#fff;font-size:15px;
                font-weight:bold;padding:14px 32px;border-radius:6px;text-decoration:none;
                letter-spacing:0.03em">
        👀 See Your Site Live →
      </a>
    </div>

    <p style="font-size:15px;color:#333;line-height:1.7">
      The site is fully yours for a one-time fee of <strong>{price}</strong> — no
      monthly fees, no subscriptions. That includes:
    </p>

    <ul style="font-size:14px;color:#444;line-height:2">
      <li>✅ Custom design built specifically for {name}</li>
      <li>✅ Mobile-friendly (looks great on any phone)</li>
      <li>✅ Your phone number, address, and hours</li>
      <li>✅ Hosted &amp; live in 24 hours after payment</li>
      <li>✅ Custom domain setup if you want one (e.g. {domain_hint})</li>
    </ul>

    <p style="font-size:15px;color:#333;line-height:1.7">
      If you're not interested, no hard feelings — I'll take it down. But I think
      you'll like it. Hit reply or give me a call and we can sort it out in 10 minutes.
    </p>

    <p style="font-size:15px;color:#111;margin-bottom:4px">— {from_name}</p>
    <p style="font-size:13px;color:#999;margin:0">{from_company}</p>
    <p style="font-size:13px;color:#999;margin:0">{gmail_user}</p>

    <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
    <p style="font-size:11px;color:#bbb;text-align:center">
      You're receiving this because {name} appeared in a Google Maps search for local
      businesses in {city}. Reply STOP to be removed.
    </p>
  </div>
</body>
</html>
"""

PLAIN_BODY = """Hi {first_name},

My name is {from_name} from {from_company}. I help local businesses in {city} get online fast.

I noticed {name} doesn't have a website. I went ahead and built one — it's already live:

{site_url}

It's yours for a one-time fee of {price} (no monthly fees). Includes custom design, mobile-friendly, your contact info, and hosting.

Hit reply or email me at {gmail_user} and we can sort it in 10 minutes.

— {from_name}
{from_company}

Reply STOP to unsubscribe.
"""

def make_domain_hint(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '', name.lower())[:20]
    return f"{slug}.com"

def first_name_from_business(name: str) -> str:
    """Best-effort: just use 'there' — works universally."""
    return "there"

def send_email(to_email: str, lead: dict, dry_run: bool = False) -> bool:
    vars_ = {
        "name": lead["name"],
        "first_name": first_name_from_business(lead["name"]),
        "city": lead.get("city", "your city"),
        "site_url": lead["site_url"],
        "price": PRICE,
        "from_name": FROM_NAME,
        "from_company": FROM_CO,
        "gmail_user": GMAIL_USER,
        "domain_hint": make_domain_hint(lead["name"]),
    }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = SUBJECT.format(**vars_)
    msg["From"]    = f"{FROM_NAME} <{GMAIL_USER}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(PLAIN_BODY.format(**vars_), "plain"))
    msg.attach(MIMEText(HTML_BODY.format(**vars_), "html"))

    # Save a copy regardless
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    slug = re.sub(r'[^a-z0-9]+', '_', lead["name"].lower())
    email_path = OUTPUT_DIR / f"{slug}_{ts}.html"
    with open(email_path, "w", encoding="utf-8") as f:
        f.write(HTML_BODY.format(**vars_))

    if dry_run:
        print(f"  [DRY RUN] Would send to: {to_email}")
        print(f"  Subject: {msg['Subject']}")
        print(f"  Preview saved: {email_path}")
        return True

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=CTX) as s:
            s.login(GMAIL_USER, GMAIL_PASS)
            s.sendmail(GMAIL_USER, to_email, msg.as_string())
        print(f"  📧  Sent to {to_email}")
        return True
    except Exception as e:
        print(f"  ✗  Send failed: {e}")
        return False

def email_all(leads_path: Path, dry_run: bool = False):
    with open(leads_path, encoding="utf-8") as f:
        leads = json.load(f)

    pending = [l for l in leads if l.get("status") == "deployed" and not l.get("email_sent")]
    print(f"\n📧  Emailing {len(pending)} leads (dry_run={dry_run})...")

    for i, lead in enumerate(pending):
        print(f"\n  [{i+1}/{len(pending)}] {lead['name']}")

        # Try to find email
        email = lead.get("owner_email")
        if not email:
            print("    🔍  Searching for contact email via Tavily...")
            email = find_email_tavily(lead["name"], lead.get("city", ""))
            if email:
                lead["owner_email"] = email
                print(f"    Found: {email}")
            else:
                print("    No email found — skipping")
                lead["status"] = "no_email_found"
                continue

        ok = send_email(email, lead, dry_run=dry_run)
        if ok:
            lead["email_sent"] = True
            lead["email_sent_at"] = datetime.utcnow().isoformat()
            lead["status"] = "emailed"

    with open(leads_path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, ensure_ascii=False)
    return leads_path

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't actually send, just preview")
    args = parser.parse_args()
    from prospector import load_latest_leads
    path, _ = load_latest_leads()
    email_all(path, dry_run=args.dry_run)
