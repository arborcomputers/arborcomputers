#!/usr/bin/env python3
"""Add footer links to pages that had few links from the rest of the site (SEO).

Footer "Explore" gets Healthcare IT (after Dental IT); footer "About Us" gets
Our Team and Onsite & Remote Support (after Our Company). Every page in public/
is edited in both copies of its content: the HTML, and the React data payload
(self.__next_f) the page hydrates from (see README "Editing a page").

Run from the repo root:  python3 scripts/footer-links.py
Safe to re-run: links that are already there are skipped.
"""
import re
from pathlib import Path

# (anchor link href, new href, HTML label, payload "children" JSON)
LINKS = [
    ("/dental-it-services-and-solutions/", "/healthcare/",
     'Healthcare <span class="it-accent">IT</span>',
     r'[\"Healthcare \",[\"$\",\"span\",null,{\"className\":\"it-accent\",\"children\":\"IT\"}]]'),
    ("/about-us/", "/about-us/our-team/", "Our Team", r'\"Our Team\"'),
    ("/about-us/our-team/", "/about-us/support/", "Onsite &amp; Remote Support", r'\"Onsite & Remote Support\"'),
]


def footer_bounds(text):
    start = text.find("<footer")
    return start, text.find("</footer>", start)


def edit(text):
    changed = 0
    for anchor, href, label, payload_children in LINKS:
        # HTML copy, inside the footer only
        s, e = footer_bounds(text)
        footer = text[s:e]
        if f'href="{href}"' not in footer:
            m = re.search(r'<a href="' + re.escape(anchor) + r'">.*?</a>', footer)
            if not m:
                raise SystemExit(f"footer link {anchor} not found")
            footer = footer[: m.end()] + f'<a href="{href}">{label}</a>' + footer[m.end():]
            text = text[:s] + footer + text[e:]
            changed += 1
        # payload copy: footer links look like [\"$\",\"$L1d\",null,{\"href\":\"/about-us/\",\"children\":...}]
        in_footer = lambda m: 0 < m.start() - text.rfind('\\"sf-links\\"', 0, m.start()) < 3000
        if not any(in_footer(m) for m in re.finditer(re.escape(f'\\"href\\":\\"{href}\\"'), text)):
            pat = re.compile(r'\[\\"\$\\",\\"(\$L[0-9a-z]+)\\",null,\{\\"href\\":\\"' + re.escape(anchor)
                             + r'\\",\\"children\\":(?:\\"[^\\]*\\"|\[[^\]]*\]\]|\[[^\]]*\])\}\]')
            sf = [m for m in pat.finditer(text) if in_footer(m)]
            if not sf:
                raise SystemExit(f"payload footer link {anchor} not found")
            m = sf[-1]
            new = rf',[\"$\",\"{m.group(1)}\",null,{{\"href\":\"{href}\",\"children\":{payload_children}}}]'
            text = text[: m.end()] + new + text[m.end():]
            changed += 1
    return text, changed


def main():
    total = 0
    for path in sorted(Path("public").rglob("*.html")):
        if "_next" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "<footer" not in text:
            continue
        new, n = edit(text)
        if n:
            path.write_text(new, encoding="utf-8")
            total += 1
    print(f"updated {total} pages")


if __name__ == "__main__":
    main()
