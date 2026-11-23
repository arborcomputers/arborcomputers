#!/usr/bin/env python3
"""Insert the "Our Team" section on /about-us/, directly under Moin's founder letter.

The pages in public/ are the saved output of the original Next.js build, so each
page carries two copies of its content: the HTML, and the React data payload
(self.__next_f) that the page's scripts hydrate from. Both must change together,
or React throws the new section away on load. This script edits both.

Run from the repo root:  python3 scripts/add-team-section.py
Safe to re-run: it replaces an existing team section instead of adding a second one.
"""
import html
import json
import re
from pathlib import Path

PAGE = Path("public/about-us/index.html")
SECTION_ID = "team"
BEFORE_SECTION = '"aria-labelledby":"services-title"'  # the section the team goes in front of

TEAM = [
    ("amro-badareen", "Amro Badareen", "Lead Technician",
     "Handles it all. If it has a power button, Amro knows how to fix it."),
    ("rohan-shah", "Rohan Shah", "Apple Technician",
     "Our go-to for MacBooks, iPhones, iPads and iMacs, from diagnostics to repair."),
    ("karam-ghannam", "Karam Ghannam", "Repair Specialist",
     "Expert in every kind of repair, from cracked screens to board-level fixes."),
    ("safwan-ahmed", "Safwan Ahmed", "Repair Technician",
     "Hands-on repair tech who gets devices fixed right and back to you fast."),
]

CSS = """
.atm{position:relative;isolation:isolate;overflow:hidden;background:#070b14;color:#fff;padding:112px 16px 128px}
.atm-glow{position:absolute;left:50%;top:0;width:min(900px,140vw);height:520px;transform:translateX(-50%);z-index:-1;border-radius:50%;background:radial-gradient(closest-side,rgba(33,150,243,.22),transparent);filter:blur(32px);pointer-events:none}
.atm-head{max-width:672px;margin:0 auto;text-align:center}
.atm-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);border-radius:999px;padding:4px 14px;font-size:12px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#7dd3fc}
.atm-dot{width:6px;height:6px;border-radius:50%;background:#38bdf8}
.atm h2{font-size:clamp(34px,5vw,48px);font-weight:600;letter-spacing:-.025em;line-height:1.1;margin:24px 0 0;color:#fff;text-wrap:balance}
.atm-grad{background:linear-gradient(90deg,#7dd3fc,#3b82f6);-webkit-background-clip:text;background-clip:text;color:transparent}
.atm-lede{color:#94a3b8;font-size:18px;line-height:1.75;margin:20px 0 0}
.atm-grid{list-style:none;padding:0;margin:64px auto 0;max-width:1232px;display:grid;gap:24px;grid-template-columns:repeat(4,minmax(0,1fr))}
.atm-card{position:relative;overflow:hidden;border-radius:24px;background:#0f172a;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 25px 50px -12px rgba(0,0,0,.4);transition:transform .5s,box-shadow .5s}
.atm-item:hover .atm-card{transform:translateY(-6px);box-shadow:0 0 0 1px rgba(56,189,248,.4),0 25px 50px -12px rgba(14,165,233,.15)}
.atm-card img{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;filter:saturate(.8);transition:transform .7s ease-out,filter .7s}
.atm-item:hover .atm-card img{transform:scale(1.05);filter:saturate(1)}
.atm-shade{position:absolute;inset:0;background:linear-gradient(to top,#070b14 5%,rgba(7,11,20,.7) 25%,transparent 60%)}
.atm-label{position:absolute;left:0;right:0;bottom:0;padding:24px}
.atm-role{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#7dd3fc;margin:0}
.atm h3{font-size:20px;font-weight:600;margin:6px 0 0;color:#fff}
.atm-bio{color:#94a3b8;font-size:14px;line-height:1.7;margin:20px 4px 0}
@media (max-width:1023px){.atm-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
@media (max-width:639px){.atm-grid{grid-template-columns:minmax(0,1fr);max-width:384px}.atm-br{display:none}.atm{padding:88px 16px 96px}}
@media (prefers-reduced-motion:reduce){.atm-card,.atm-card img{transition:none}.atm-item:hover .atm-card,.atm-item:hover .atm-card img{transform:none}}
""".strip()


def el(tag, props=None, *children):
    p = dict(props or {})
    if children:
        p["children"] = children[0] if len(children) == 1 else list(children)
    return ["$", tag, None, p]


def build():
    cards = []
    for slug, name, role, bio in TEAM:
        cards.append(el("li", {"className": "atm-item"},
            el("div", {"className": "atm-card"},
                el("img", {"src": f"/assets/images/team/{slug}.webp", "alt": f"{name}, {role}",
                           "width": "800", "height": "1000", "loading": "lazy", "decoding": "async"}),
                el("div", {"className": "atm-shade"}),
                el("div", {"className": "atm-label"},
                    el("p", {"className": "atm-role"}, role),
                    el("h3", None, name))),
            el("p", {"className": "atm-bio"}, bio)))
    return el("section", {"aria-labelledby": "team-title", "className": "atm", "id": SECTION_ID},
        el("style", None, CSS),
        el("div", {"aria-hidden": "true", "className": "atm-glow"}),
        el("div", {"className": "atm-head"},
            el("span", {"className": "atm-pill"}, el("span", {"aria-hidden": "true", "className": "atm-dot"}), "Our Team"),
            el("h2", {"id": "team-title"}, "The people behind ", el("br", {"className": "atm-br"}),
               el("span", {"className": "atm-grad"}, "Arbor Computers")),
            el("p", {"className": "atm-lede"}, "Certified technicians who treat every device like it's their own.")),
        el("ul", {"className": "atm-grid"}, *cards))


VOID = {"img", "br"}
ATTR = {"className": "class"}


def render(node):
    """Render a payload element to HTML the way React's server renderer does."""
    if isinstance(node, str):
        return html.escape(node, quote=False)
    if isinstance(node, list) and node and node[0] == "$":
        _, tag, _, props = node
        attrs = "".join(f' {ATTR.get(k, k)}="{html.escape(str(v))}"' for k, v in props.items() if k != "children")
        if tag in VOID:
            return f"<{tag}{attrs}/>"
        kids = props.get("children")
        if tag == "style":
            inner = kids
        elif isinstance(kids, list) and not (kids and kids[0] == "$"):
            parts = [render(k) for k in kids]
            # React separates neighbouring text nodes with an empty comment
            inner = ""
            for i, k in enumerate(kids):
                if i and isinstance(k, str) and isinstance(kids[i - 1], str):
                    inner += "<!-- -->"
                inner += parts[i]
        elif kids is None:
            inner = ""
        else:
            inner = render(kids)
        return f"<{tag}{attrs}>{inner}</{tag}>"
    raise TypeError(node)


def main():
    page = PAGE.read_text()
    section = build()
    section_html = render(section)

    # 1) HTML: drop any earlier copy, then insert before the services section.
    page = re.sub(r'<section aria-labelledby="team-title".*?</ul></section>', "", page, flags=re.S)
    anchor = '<section aria-labelledby="services-title"'
    assert page.count(anchor) == 1, "services section not found in HTML"
    page = page.replace(anchor, section_html + anchor)

    # 2) React payload: wrap the services row as [team, services].
    m = re.search(r'<script>self\.__next_f\.push\((\[1,.*?\])\)</script>', page, flags=re.S)
    assert m, "payload script not found"
    flight = json.loads(m.group(1))[1]
    rows = flight.split("\n")
    wrapped = '[["$","section",null,{"aria-labelledby":"team-title"'
    hits = [i for i, r in enumerate(rows)
            if BEFORE_SECTION in r.split(":", 1)[-1][:120] or r.split(":", 1)[-1].startswith(wrapped)]
    assert len(hits) == 1, f"services row not found ({hits})"
    i = hits[0]
    rid, value = rows[i].split(":", 1)
    value = json.loads(value)
    if isinstance(value, list) and value and isinstance(value[0], list):  # already wrapped
        value = value[-1]
    rows[i] = rid + ":" + json.dumps([section, value], ensure_ascii=False, separators=(",", ":"))
    new = json.dumps([1, "\n".join(rows)], ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    page = page[:m.start(1)] + new + page[m.end(1):]

    PAGE.write_text(page)
    print("Team section added to", PAGE)


if __name__ == "__main__":
    main()
