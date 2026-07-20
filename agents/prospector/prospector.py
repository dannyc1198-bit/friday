"""
prospector.py — finds local businesses on Google Places with no website.

Usage:
    python prospector.py --city "Vancouver, BC" --types restaurant,hair_care --radius 10 --max 20
"""

import os, json, ssl, time, argparse, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

MAPS_KEY = os.environ["GOOGLE_MAPS_API_KEY"]
OUTPUT_DIR = Path(__file__).parent / "output" / "leads"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CTX = ssl.create_default_context()

def maps_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=CTX, timeout=10) as r:
        return json.loads(r.read())

def geocode(city: str) -> tuple[float, float]:
    """Turn a city name into lat/lng."""
    q = urllib.parse.quote(city)
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={q}&key={MAPS_KEY}"
    data = maps_get(url)
    if data["status"] != "OK":
        raise RuntimeError(f"Geocode failed: {data['status']}")
    loc = data["results"][0]["geometry"]["location"]
    return loc["lat"], loc["lng"]

def nearby_search(lat: float, lng: float, biz_type: str, radius_m: int, page_token: str = None):
    """One page of nearby search results."""
    params = {
        "location": f"{lat},{lng}",
        "radius": radius_m,
        "type": biz_type,
        "key": MAPS_KEY,
    }
    if page_token:
        params["pagetoken"] = page_token
    qs = urllib.parse.urlencode(params)
    url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?{qs}"
    return maps_get(url)

def place_details(place_id: str) -> dict:
    """Get full details including website + phone."""
    fields = "name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,business_status"
    url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields={fields}&key={MAPS_KEY}"
    data = maps_get(url)
    return data.get("result", {})

def find_no_website_businesses(city: str, types: list[str], radius_km: int, max_leads: int) -> list[dict]:
    """Main search loop. Returns list of businesses with no website."""
    print(f"\n🔍  Searching '{city}' within {radius_km}km for: {', '.join(types)}")
    lat, lng = geocode(city)
    radius_m = radius_km * 1000
    leads = []

    for biz_type in types:
        if len(leads) >= max_leads:
            break
        print(f"\n  Type: {biz_type}")
        page_token = None
        page = 0

        while len(leads) < max_leads:
            if page_token:
                time.sleep(2)  # Google requires delay before using next_page_token
            data = nearby_search(lat, lng, biz_type, radius_m, page_token)
            status = data.get("status")
            results = data.get("results", [])
            print(f"    Page {page+1}: {len(results)} results (status={status})")

            for place in results:
                if len(leads) >= max_leads:
                    break
                if place.get("business_status") != "OPERATIONAL":
                    continue

                place_id = place["place_id"]
                details = place_details(place_id)

                # Skip if they already have a website
                if details.get("website"):
                    continue

                lead = {
                    "place_id": place_id,
                    "name": details.get("name", place.get("name", "")),
                    "address": details.get("formatted_address", ""),
                    "phone": details.get("formatted_phone_number", ""),
                    "rating": details.get("rating"),
                    "review_count": details.get("user_ratings_total", 0),
                    "types": details.get("types", []),
                    "primary_type": biz_type,
                    "city": city,
                    "found_at": datetime.utcnow().isoformat(),
                    "website": None,
                    "status": "lead",  # lead → site_built → deployed → emailed
                    "site_url": None,
                    "email_sent": False,
                    "owner_email": None,
                }
                leads.append(lead)
                print(f"    ✓  {lead['name']} — {lead['address']} (no website)")

            page_token = data.get("next_page_token")
            page += 1
            if not page_token or status != "OK":
                break

    return leads

def save_leads(leads: list[dict], city: str) -> Path:
    slug = city.lower().replace(",", "").replace(" ", "_")
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"leads_{slug}_{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, ensure_ascii=False)
    print(f"\n✅  Saved {len(leads)} leads → {path}")
    return path

def load_latest_leads() -> tuple[Path, list[dict]]:
    files = sorted(OUTPUT_DIR.glob("leads_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise FileNotFoundError("No leads files found. Run prospector first.")
    path = files[0]
    with open(path, encoding="utf-8") as f:
        return path, json.load(f)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", default=os.environ.get("TARGET_CITY", "Vancouver, BC"))
    parser.add_argument("--types", default=os.environ.get("TARGET_TYPES", "restaurant,hair_care"))
    parser.add_argument("--radius", type=int, default=int(os.environ.get("TARGET_RADIUS_KM", 10)))
    parser.add_argument("--max", type=int, default=int(os.environ.get("MAX_LEADS_PER_RUN", 20)))
    args = parser.parse_args()

    types_list = [t.strip() for t in args.types.split(",")]
    leads = find_no_website_businesses(args.city, types_list, args.radius, args.max)
    if leads:
        save_leads(leads, args.city)
    else:
        print("No leads found.")
