"""
site_builder.py — uses Claude to generate a custom HTML website for each lead.
The site looks real, professional, and specific to that business.
"""

import os, json, re
from pathlib import Path
from datetime import datetime
import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
OUTPUT_DIR = Path(__file__).parent / "output" / "sites"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SITE_PROMPT = """You are an expert web designer. Build a complete, beautiful, single-file HTML website for this local business.

Business details:
- Name: {name}
- Type: {primary_type}
- Address: {address}
- Phone: {phone}
- Rating: {rating} stars ({review_count} reviews on Google)
- City: {city}

REQUIREMENTS:
1. Single self-contained HTML file — all CSS inline in <style>, no external dependencies except Google Fonts
2. Mobile-first responsive design
3. Modern, professional aesthetic appropriate for the business type
4. Sections: Hero (with business name + tagline), Services/Menu (invent 5-6 plausible services), About, Contact (use their real phone + address), Google Maps embed placeholder
5. Color palette and tone must match the business type (e.g. warm/earthy for restaurant, clean/clinical for dentist, bold for gym)
6. Include: a clear call-to-action button ("Call Now" or "Book Appointment"), fake but realistic business hours, a testimonials section with 3 fake 5-star reviews using local-sounding names
7. Footer with © {year} {name} | All Rights Reserved
8. NO placeholder images — use CSS gradients and emoji/icons instead
9. The site should look like it was built by a $3,000 freelancer

Output ONLY the raw HTML — no markdown fences, no commentary, just the HTML starting with <!DOCTYPE html>
"""

def build_site(lead: dict) -> str:
    """Ask Claude to build a website for this lead. Returns HTML string."""
    prompt = SITE_PROMPT.format(
        name=lead["name"],
        primary_type=lead.get("primary_type", "local business"),
        address=lead.get("address", ""),
        phone=lead.get("phone", "Call us"),
        rating=lead.get("rating", "5.0"),
        review_count=lead.get("review_count", 0),
        city=lead.get("city", ""),
        year=datetime.utcnow().year,
    )

    print(f"  🏗  Building site for: {lead['name']}...")
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}]
    )

    html = message.content[0].text.strip()
    # Strip any accidental markdown fences
    html = re.sub(r'^```html\s*', '', html)
    html = re.sub(r'\s*```$', '', html)
    if not html.startswith("<!"):
        # Claude added commentary — extract just the HTML
        match = re.search(r'(<!DOCTYPE html>.*)', html, re.DOTALL | re.IGNORECASE)
        if match:
            html = match.group(1)

    return html

def save_site(lead: dict, html: str) -> Path:
    slug = re.sub(r'[^a-z0-9]+', '_', lead["name"].lower()).strip('_')
    path = OUTPUT_DIR / f"{slug}.html"
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  💾  Saved → {path}")
    return path

def build_sites_for_leads(leads_path: Path) -> Path:
    with open(leads_path, encoding="utf-8") as f:
        leads = json.load(f)

    pending = [l for l in leads if l.get("status") == "lead"]
    print(f"\n🏗  Building sites for {len(pending)} leads...")

    for i, lead in enumerate(pending):
        try:
            html = build_site(lead)
            site_path = save_site(lead, html)
            lead["status"] = "site_built"
            lead["site_local_path"] = str(site_path)
            print(f"  ✓  [{i+1}/{len(pending)}] {lead['name']}")
        except Exception as e:
            print(f"  ✗  {lead['name']}: {e}")
            lead["status"] = "site_error"
            lead["site_error"] = str(e)

    with open(leads_path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, ensure_ascii=False)

    return leads_path

if __name__ == "__main__":
    from prospector import load_latest_leads
    path, _ = load_latest_leads()
    build_sites_for_leads(path)
