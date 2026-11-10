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
# Only the Staging static build makes formerly-optional fields required.
# Main index.html stays exactly unchanged for existing customers.
required_labels = {
    '>ทะเบียนรถ</label>': '>ทะเบียนรถ *</label>',
    '>เบอร์โทรศัพท์ติดต่อ (ไม่บังคับ)</label>': '>เบอร์โทรศัพท์ติดต่อ *</label>',
    '>อีเมลสำหรับการยืนยันการจอง (ไม่บังคับ)</label>': '>อีเมลสำหรับการยืนยันการจอง *</label>',
}
for old, new in required_labels.items():
    if html.count(old) != 1:
        raise SystemExit(f"Missing mandatory label in Staging HTML: {old}")
    html = html.replace(old, new)
for field in ('custVehicle', 'custPhone', 'custEmail'):
    # Add the native HTML required flag, retaining the existing form layout.
    start = html.index('id="' + field + '"')
    close = html.index('>', start)
    tag = html[start:close]
    if ' required' not in tag:
        html = html[:close] + ' required' + html[close:]
for field in ('custVehicle', 'custPhone', 'custEmail'):
    start = html.index('id="' + field + '"')
    if ' required' not in html[start:html.index('>', start)]:
        raise SystemExit(f"Required input flag missing: {field}")

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

# Package Staging Admin portal for standalone Netlify hosting.
admin_target = target / "admin"
admin_target.mkdir(exist_ok=True)
admin_html = (root / "staging" / "admin" / "payments.html").read_text(encoding="utf-8")
if "kssxxizhpoxxlbsehymk" not in admin_html or "eqwmodrhorcbwsshbepg" in admin_html:
    raise SystemExit("Admin preview must connect exclusively to Staging")
(admin_target / "payments.html").write_text(admin_html, encoding="utf-8")
assert sorted(x.name for x in target.iterdir()) == [
    "admin", "app.js", "charts.js", "index.html", "style.css"
]
print("Static test site built under staging/site-dist (Production files unchanged).")
