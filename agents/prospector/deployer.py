"""
deployer.py — deploys each built HTML site to Netlify as a live URL.
Each business gets a unique subdomain: businessname.netlify.app
"""

import os, json, zipfile, io, ssl, urllib.request, urllib.error, re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

NETLIFY_TOKEN = os.environ["NETLIFY_AUTH_TOKEN"]
CTX = ssl.create_default_context()
NETLIFY_API = "https://api.netlify.com/api/v1"

def netlify_request(method: str, path: str, data=None, headers=None):
    url = NETLIFY_API + path
    h = {
        "Authorization": f"Bearer {NETLIFY_TOKEN}",
        "User-Agent": "WavelengthProspector/1.0",
    }
    if headers:
        h.update(headers)
    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        else:
            body = data  # raw bytes (zip)

    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Netlify {method} {path} → {e.code}: {e.read().decode()[:300]}")

def create_site(site_name: str) -> str:
    """Create a Netlify site and return its site_id."""
    # site name must be lowercase alphanumeric + hyphens, max 63 chars
    slug = re.sub(r'[^a-z0-9]+', '-', site_name.lower()).strip('-')[:55]
    slug = f"wl-{slug}"  # prefix so it's clearly Wavelength-owned
    try:
        data = netlify_request("POST", "/sites", {"name": slug})
        return data["id"], data["default_domain"]
    except RuntimeError as e:
        if "already exists" in str(e) or "422" in str(e):
            # Try with timestamp suffix
            import time
            slug = slug[:45] + f"-{int(time.time())%10000}"
            data = netlify_request("POST", "/sites", {"name": slug})
            return data["id"], data["default_domain"]
        raise

def deploy_html(site_id: str, html_path: Path) -> str:
    """Zip the HTML as index.html and deploy. Returns deploy URL."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(html_path, "index.html")
    buf.seek(0)
    zip_bytes = buf.read()

    data = netlify_request(
        "POST",
        f"/sites/{site_id}/deploys",
        data=zip_bytes,
        headers={"Content-Type": "application/zip"},
    )
    return data.get("deploy_ssl_url") or data.get("ssl_url") or data.get("url", "")

def deploy_lead(lead: dict) -> str:
    """Full flow: create site + deploy. Returns live HTTPS URL."""
    site_id, domain = create_site(lead["name"])
    lead["netlify_site_id"] = site_id
    html_path = Path(lead["site_local_path"])
    url = deploy_html(site_id, html_path)
    if not url.startswith("http"):
        url = f"https://{domain}"
    return url

def deploy_all(leads_path: Path):
    with open(leads_path, encoding="utf-8") as f:
        leads = json.load(f)

    pending = [l for l in leads if l.get("status") == "site_built"]
    print(f"\n🚀  Deploying {len(pending)} sites to Netlify...")

    for i, lead in enumerate(pending):
        try:
            url = deploy_lead(lead)
            lead["site_url"] = url
            lead["status"] = "deployed"
            print(f"  ✓  [{i+1}/{len(pending)}] {lead['name']} → {url}")
        except Exception as e:
            print(f"  ✗  {lead['name']}: {e}")
            lead["status"] = "deploy_error"
            lead["deploy_error"] = str(e)

    with open(leads_path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, ensure_ascii=False)

    return leads_path

if __name__ == "__main__":
    from prospector import load_latest_leads
    path, _ = load_latest_leads()
    deploy_all(path)
