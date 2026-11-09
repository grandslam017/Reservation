#!/usr/bin/env python3
"""Assemble a STAGING-ONLY static website for separate, free HTTPS hosting.

The original repository customer UI remains unchanged. Output has an identical
layout but intentionally redacts real payment details in the test site HTML.
Never deploy this bundle to Production or GitHub Pages main.
"""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[2]
target = root / "staging" / "site-dist"
target.mkdir(parents=True, exist_ok=True)

html = (root / "index.html").read_text(encoding="utf-8")
replacements = {
    "0894932242": "TEST ONLY",
    "ชื่อบัญชี: ณฐกร เอียสกุล": "บัญชีทดสอบ — ห้ามโอนเงินจริง",
    'src="promptpay_qr.png"': 'alt="ระบบทดลอง ไม่ต้องโอนเงินจริง"',
    'href="accounting.html"': 'href="#"',
}
for old, new in replacements.items():
    if html.count(old) != 1:
        raise SystemExit(f"Expected exactly one occurrence of safe replacement: {old[:25]!r}")
    html = html.replace(old, new)
html = html.replace(
    '<title>The Grand Slam Tennis Court - Booking & Admin Portal</title>',
    '<title>STAGING TEST — The Grand Slam Tennis Court</title>',
)
if "promptpay_qr.png" in html or "0894932242" in html:
    raise SystemExit("Payment detail redaction failed")
(target / "index.html").write_text(html, encoding="utf-8")

for name in ("style.css", "charts.js", "app.js"):
    data = (root / name).read_bytes()
    (target / name).write_bytes(data)

app = (target / "app.js").read_text(encoding="utf-8")
if 'GRANDSLAM_STAGING_ONLY = true' not in app:
    raise SystemExit("Staging-only toggle not found")
for forbidden in ("eqwmodrhorcbwsshbepg", "script.google.com/macros/s/", "sb_secret_", "SUPABASE_SERVICE_ROLE_KEY"):
    if forbidden in app:
        raise SystemExit(f"Production or sensitive reference present in app.js: {forbidden}")

assert sorted(x.name for x in target.iterdir()) == [
    "app.js", "charts.js", "index.html", "style.css"
]
print("Static test site built under staging/site-dist (Production files unchanged).")
