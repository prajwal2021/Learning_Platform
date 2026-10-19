"""One-time extractor for the Learning Path page.

Splits legacy-static/index.html into
  - api/seed/path.json     (page shell, one record per unit, the step list)  -> PostgreSQL
  - web/src/styles/path.css
  - web/src/legacy/path.ts (interactive code only; ticks are saved through the API)

    python tools/extract_path.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "legacy-static/index.html"
html = SRC.read_text()

STACKMAP = "https://claude.ai/artifact/AAy87d8ofDzb4ZydNhyzbn"


def relink(s: str) -> str:
    return s.replace(STACKMAP, "/stack-map")


# ---- css
css = re.search(r"<style>\n(.*?)\n</style>", html, re.S).group(1)
(ROOT / "web/src/styles").mkdir(parents=True, exist_ok=True)
(ROOT / "web/src/styles/path.css").write_text(css + "\n")

# ---- body: everything from <div class="lp"> up to the script
body = html[html.index('<div class="lp"'): html.index("<script>")]
body = relink(body)

units_open = '<section class="units" aria-label="Units">\n'
a = body.index(units_open) + len(units_open)
b = body.index("</section>", a)
units_html = body[a:b]
shell = body[:a] + "<!--UNITS-->" + body[b:]

# the ticks are on the server now, so two sentences of the original copy would be wrong
shell = shell.replace(
    "Ticks are saved by this browser on this device. They do not move to another browser or another device.",
    "Ticks are saved to your account on the server. They follow you to any browser or device you open this with.",
)
shell = shell.replace(
    "This browser did not save the ticks. They last until this page is closed.",
    "The ticks could not be saved. They last until this page is closed.",
)

units = []
steps = []
for i, m in enumerate(re.finditer(r'<details class="unit (built|planned)[^"]*" id="unit-([0-9E]+)"(.*?)</details>\n?(?=<details class="unit|\Z)', units_html, re.S)):
    status, num = m.group(1), m.group(2)
    block = m.group(0).rstrip("\n")
    name = re.search(r'data-name="([^"]*)"', block).group(1)
    units.append({"num": num, "ord": i, "name": name, "status": status, "open": bool(re.match(r"<details[^>]* open>", block)), "html": block})
    for j, s in enumerate(re.finditer(r'<li class="step" data-step="([^"]+)"( data-opt)?', block)):
        steps.append({"id": s.group(1), "unit": num, "ord": j, "optional": bool(s.group(2))})

assert len(units) == 15, len(units)  # units 0-13 and the electives
# the glue has to reproduce the original units markup exactly
assert "\n".join(u["html"] for u in units) == units_html.rstrip("\n"), "unit split changed the markup"

seed = {"shell": shell, "units": units, "steps": steps}
(ROOT / "api/seed/path.json").write_text(json.dumps(seed))

# ---- script
js = re.search(r"<script>\n(.*?)\n</script>", html, re.S).group(1)
js = js.replace('(function () {\n  "use strict";\n  var root = document.getElementById("lp");\n  var KEY = root.getAttribute("data-key");',
                'var root = document.getElementById("lp");')
old_store = re.search(r"  /\* Ticks are kept in the browser.*?\n  function keep\(\)[^\n]*\n", js, re.S).group(0)
new_store = '''  /* Ticks are kept on the server. If a save fails, they last until the page is closed. */
  var done = initial && typeof initial === "object" ? Object.assign({}, initial) : {}, kept = true;
  function keep() { save(done).then(function () { kept = true; $("nx-warn").hidden = true; }, function () { kept = false; $("nx-warn").hidden = false; }); }
'''
js = js.replace(old_store, new_store)
assert js.rstrip().endswith("})();")
js = js.rstrip()[: -len("})();")].rstrip() + "\n}\n"
body_js = js.split('var root = document.getElementById("lp");', 1)[1]
ts = ("// @ts-nocheck\n/* eslint-disable */\n"
      "/* Interactive code of the Learning Path page, moved over with its behaviour unchanged.\n"
      "   Ticks are read from and saved to the API instead of the browser. */\n"
      "export function start(initial, save) {\n  \"use strict\";\n  var root = document.getElementById(\"lp\");" + body_js)
(ROOT / "web/src/legacy").mkdir(parents=True, exist_ok=True)
(ROOT / "web/src/legacy/path.ts").write_text(ts)
print("units", len(units), "steps", len(steps), "shell", len(shell), "bytes")
