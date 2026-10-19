"""Small, faithful .docx -> HTML converter for the Core Build Starter Guide.

Keeps what the document actually uses: headings, paragraphs, bold / italic / monospace runs, hyperlinks, bookmarks,
bulleted and numbered lists (nested), tables with header rows and shaded cells, and images. Colours are mapped to CSS
classes (not inline colours) so the page follows the site's light and dark themes.
"""
import html
import re
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"

FILL_CLASS = {
    "1F4E79": "c-head", "F6E3BF": "c-note", "E2E6EB": "c-label", "E3EAF2": "c-label", "EAF0F6": "c-label",
    "F4F6F8": "c-alt", "F5F8FB": "c-alt", "F8FAFC": "c-alt", "FFFFFF": "",
}


def esc(s):
    return html.escape(s, quote=False)


class Doc:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.root = ET.fromstring(self.z.read("word/document.xml"))
        rels = ET.fromstring(self.z.read("word/_rels/document.xml.rels"))
        self.rels = {r.get("Id"): (r.get("Target"), r.get("TargetMode")) for r in rels}
        self.num = self._numbering()
        self.images = {}  # name -> bytes

    def _numbering(self):
        root = ET.fromstring(self.z.read("word/numbering.xml"))
        abstract = {}
        for a in root.iter(W + "abstractNum"):
            lv = {}
            for l in a.findall(W + "lvl"):
                fmt = l.find(W + "numFmt")
                lv[int(l.get(W + "ilvl"))] = fmt.get(W + "val") if fmt is not None else "decimal"
            abstract[a.get(W + "abstractNumId")] = lv
        nums = {}
        for n in root.findall(W + "num"):
            nums[n.get(W + "numId")] = abstract.get(n.find(W + "abstractNumId").get(W + "val"), {})
        return nums

    # ---- runs
    def run_html(self, r):
        out = []
        for c in r:
            if c.tag == W + "t":
                out.append(esc(c.text or ""))
            elif c.tag == W + "tab":
                out.append(" ")
            elif c.tag == W + "br":
                out.append("<br>")
            elif c.tag == W + "drawing":
                out.append(self.drawing(c))
        text = "".join(out)
        if not text:
            return ""
        rpr = r.find(W + "rPr")
        if rpr is not None:
            fonts = rpr.find(W + "rFonts")
            mono = fonts is not None and fonts.get(W + "ascii") == "Consolas"
            if rpr.find(W + "b") is not None and rpr.find(W + "b").get(W + "val") not in ("0", "false"):
                text = f"<b>{text}</b>"
            if rpr.find(W + "i") is not None and rpr.find(W + "i").get(W + "val") not in ("0", "false"):
                text = f"<i>{text}</i>"
            if mono:
                text = f"<code>{text}</code>"
        return text

    def drawing(self, d):
        blip = next(d.iter(A + "blip"), None)
        if blip is None:
            return ""
        target = self.rels[blip.get(R + "embed")][0]
        name = target.split("/")[-1]
        if name not in self.images:
            self.images[name] = self.z.read("word/" + target)
        docpr = next(d.iter(WP + "docPr"), None)
        alt = (docpr.get("descr") or docpr.get("title") or "") if docpr is not None else ""
        return f'<img src="__ASSET__/{name}" alt="{html.escape(alt)}" loading="lazy">'

    def inline(self, p):
        out = []
        for c in p:
            if c.tag == W + "r":
                out.append(self.run_html(c))
            elif c.tag == W + "hyperlink":
                inner = "".join(self.run_html(r) for r in c.findall(W + "r"))
                if c.get(R + "id"):
                    href = self.rels[c.get(R + "id")][0]
                    out.append(f'<a href="{html.escape(href)}" target="_blank" rel="noopener noreferrer">{inner}</a>')
                elif c.get(W + "anchor"):
                    out.append(f'<a href="#{c.get(W + "anchor")}">{inner}</a>')
                else:
                    out.append(inner)
        return re.sub(r"</code><code>", "", "".join(out))

    def anchors(self, p):
        return [b.get(W + "name") for b in p.iter(W + "bookmarkStart") if not b.get(W + "name", "").startswith("_")]

    # ---- blocks
    def style(self, p):
        s = p.find(W + "pPr/" + W + "pStyle")
        return s.get(W + "val") if s is not None else ""

    def numpr(self, p):
        n = p.find(W + "pPr/" + W + "numPr")
        if n is None:
            return None
        return n.find(W + "numId").get(W + "val"), int(n.find(W + "ilvl").get(W + "val"))

    def blocks(self, elems):
        """Convert a sequence of w:p / w:tbl into HTML, grouping list paragraphs."""
        out, stack = [], []  # stack of (numId, level, tag)

        def close_to(level, num=None):
            while stack and (stack[-1][1] > level or (stack[-1][1] == level and num is not None and stack[-1][0] != num)):
                out.append(f"</li></{stack[-1][2]}>")
                stack.pop()

        for e in elems:
            lp = self.numpr(e) if e.tag == W + "p" else None
            if lp and self.inline(e).strip():
                num, lvl = lp
                close_to(lvl, num)
                if stack and stack[-1][1] == lvl:
                    out.append("</li>")
                else:
                    fmt = self.num.get(num, {}).get(lvl, "bullet")
                    tag = "ul" if fmt == "bullet" else "ol"
                    out.append(f"<{tag}>")
                    stack.append((num, lvl, tag))
                out.append("<li>" + self.inline(e))
                continue
            close_to(-1)
            if e.tag == W + "p":
                t = self.inline(e)
                ids = self.anchors(e)
                st = self.style(e)
                if st.startswith("Heading"):
                    lvl = int(st[-1])
                    out.append(f'<h{lvl}{" id=%s" % chr(34) + ids[0] + chr(34) if ids else ""}>{re.sub(r"<[^>]+>", "", t)}</h{lvl}>')
                elif t.strip():
                    out.append(f"<p>{t}</p>")
            elif e.tag == W + "tbl":
                out.append(self.table(e))
        close_to(-1)
        return "\n".join(out)

    def table(self, t):
        rows = []
        for tr in t.findall(W + "tr"):
            head = tr.find(W + "trPr/" + W + "tblHeader") is not None
            cells, span_carry = [], {}
            for tc in tr.findall(W + "tc"):
                pr = tc.find(W + "tcPr")
                cls, colspan = "", ""
                if pr is not None:
                    shd = pr.find(W + "shd")
                    if shd is not None:
                        cls = FILL_CLASS.get((shd.get(W + "fill") or "").upper(), "")
                    gs = pr.find(W + "gridSpan")
                    if gs is not None and gs.get(W + "val") != "1":
                        colspan = f' colspan="{gs.get(W + "val")}"'
                inner = self.blocks([c for c in tc if c.tag in (W + "p", W + "tbl")])
                tag = "th" if (head or cls == "c-head") else "td"
                cells.append(f'<{tag}{colspan}{(" class=%s" % chr(34) + cls + chr(34)) if cls else ""}>{inner}</{tag}>')
            rows.append("<tr>" + "".join(cells) + "</tr>")
        return '<div class="tablewrap"><table>' + "\n".join(rows) + "</table></div>"
