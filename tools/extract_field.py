"""Splits legacy-static/field-view.html into
   api/seed/field.json   {html: page markup, scripts: [...]}   (loaded into PostgreSQL, sent only after sign-in)
   web/src/styles/field.css
    python tools/extract_field.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "legacy-static/field-view.html").read_text()
css = re.search(r"<style>\n(.*?)\n</style>", s, re.S).group(1)
(ROOT / "web/src/styles/field.css").write_text(css + "\n")
body = s[s.index("<body>") + 6: s.index("</body>")]
scripts = re.findall(r"<script>\n?(.*?)</script>", body, re.S)
html = re.sub(r"<script>.*?</script>", "", body, flags=re.S).strip()
assert len(scripts) == 6, len(scripts)
(ROOT / "api/seed/field.json").write_text(json.dumps({"html": html, "scripts": scripts}, ensure_ascii=False))
print("html", len(html), "scripts", [len(x) for x in scripts])
