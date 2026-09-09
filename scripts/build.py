"""Generate the static site offline with Python and Node.js into docs/."""

from collections import Counter
from datetime import datetime, timezone
import html
import json
from pathlib import Path
import re
import shutil
from string import Template

from model import KINDS, elapsed_days, require, timestamp, validate
from layout import prepare_layout

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {"reference": "", "official_duplicate": "", "similarity": "9 6", "hypothesis": "2 7", "opposite": "12 4 2 4"}
SYMBOLS = dict(zip(KINDS, ("R", "D", "S", "H", "O")))


def h(value):
    return html.escape(str(value), quote=True)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_locales(directory):
    """Locale files opt a language into publication; absent keys fall back to English."""
    english = read_json(directory / "en.json")
    bundles = {}
    for path in sorted(directory.glob("*.json")):
        require(re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*", path.stem), "Invalid locale filename")
        raw = read_json(path)
        require(set(raw) <= set(english), "Unknown translation key")
        require(set(raw.get("_meta", {})) == {"name", "direction"}, "Locale metadata is required")
        require(raw["_meta"]["direction"] in {"ltr", "rtl"}, "Invalid text direction")
        require(isinstance(raw["_meta"]["name"], str) and raw["_meta"]["name"].strip(), "Missing language name")
        require(all(isinstance(value, str) and value.strip() for key, value in raw.items() if key != "_meta"), "Invalid UI translation")
        bundles[path.stem] = english | raw
    require("en" in bundles, "English is the required fallback")
    return bundles


def localized(value, locale):
    return value.get(locale, value["en"])


def issue_url(number):
    return f"https://github.com/openai/codex/issues/{number}"


def graph(curated, records, locale, text, layout=None):
    nodes = {issue["number"]: issue for issue in curated["issues"]}
    positions = {node["id"]: (node["x"], node["y"]) for node in layout["nodes"]} if layout else {number: issue["position"] for number, issue in nodes.items()}
    height = layout["height"] if layout else max(580, max(issue["position"][1] for issue in nodes.values()) + 50)
    definitions = []
    for kind in KINDS:
        definitions.append(f'<marker id="arrow-{kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="graph-arrow {kind}"/></marker>')
    paths = []
    for index, edge in enumerate(curated["relationships"]):
        kind = edge["type"]
        x1, y1 = positions[edge["from"]]
        x2, y2 = positions[edge["to"]]
        dx, dy = x2 - x1, y2 - y1
        distance = (dx * dx + dy * dy) ** 0.5
        ux, uy = dx / distance, dy / distance
        boundary = min(80 / abs(ux) if ux else 1e6, 29 / abs(uy) if uy else 1e6) + 4
        sx, sy = x1 + ux * boundary, y1 + uy * boundary
        ex, ey = x2 - ux * boundary, y2 - uy * boundary
        bend = {"reference": 15, "official_duplicate": 0, "similarity": -35, "hypothesis": 48, "opposite": -48}[kind]
        cx, cy = (sx + ex) / 2 - uy * bend, (sy + ey) / 2 + ux * bend
        arrow = f' marker-end="url(#arrow-{kind})"' if kind in {"reference", "official_duplicate"} else ""
        description = f"#{edge['from']} / #{edge['to']}: {text[kind]}. {localized(edge['note'], locale)}"
        paths.append(f'<path class="edge {kind}" data-edge-type="{kind}" data-edge-from="{edge['from']}" data-edge-to="{edge['to']}" d="M {sx:.1f} {sy:.1f} Q {cx:.1f} {cy:.1f} {ex:.1f} {ey:.1f}" stroke-dasharray="{PATTERNS[kind]}"{arrow}><title>{h(description)}</title></path>')
    circles = []
    for number, issue in nodes.items():
        x, y = positions[number]
        emphasis = " anchor-node" if number == curated["counter_issue"] else " hub-node" if number == 41513 else ""
        label = localized(issue["label"], locale)
        title = text["issue_link"].format(number=number, title=records[number]["title"])
        state = records[number]["state"]
        reason = " / " + text.get(records[number]["state_reason"], text["unknown_reason"]) if state == "closed" else ""
        status = f'{text[state]}{reason} · {text["snapshot"]}'
        accessible_title = f"{title} — {status}"
        circles.append(f'<a class="node{emphasis}" data-node-id="{number}" data-node-state="{state}" data-issue-label="{h(title)}" href="{issue_url(number)}" aria-label="{h(accessible_title)}"><title>{h(accessible_title)}</title><rect x="{x - 80}" y="{y - 29}" width="160" height="58" rx="6"/><text class="node-id" x="{x}" y="{y - 5}" text-anchor="middle">#{number}</text><text class="node-label" x="{x}" y="{y + 16}" text-anchor="middle">{h(label)}</text></a>')
    return f'<svg id="issue-graph" data-layout-settled="{str(layout is not None).lower()}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 {height}" width="1120" height="{height}" role="group" aria-labelledby="graph-title graph-description"><title id="graph-title">{h(text["graph_title"].format(count=len(nodes)))}</title><desc id="graph-description">{h(text["graph_description"])}</desc><defs>{"".join(definitions)}</defs><g class="edges">{"".join(paths)}</g><g class="nodes">{"".join(circles)}</g></svg>'


def render(curated, snapshot, locale, bundles, layout=None, now=None):
    text = bundles[locale]
    counts = Counter(edge["type"] for edge in curated["relationships"])
    records = {issue["number"]: issue for issue in snapshot["issues"]}
    anchor = records[curated["counter_issue"]]
    base = "./" if locale == "en" else "../"
    parts = {key: h(value) for key, value in text.items() if key != "_meta"}
    parts.update({
        "locale": h(locale), "direction": text["_meta"]["direction"], "base": base,
        "captured_iso": h(snapshot["fetched_at"]),
        "captured_display": h(timestamp(snapshot["fetched_at"]).strftime("%Y-%m-%d %H:%M UTC")),
        "reviewed_iso": h(curated["reviewed_at"]),
        "days": elapsed_days(anchor["created_at"], (now or datetime.now(timezone.utc)).isoformat()),
        "anchor_url": anchor["url"],
        "counter_anchor": h(text["counter_anchor"].format(number=anchor["number"])),
        "issue_count": len(records), "open_count": sum(issue["state"] == "open" for issue in records.values()),
        "graph_title": h(text["graph_title"].format(count=len(records))),
        "filter_count": h(text["filter_count"].format(visible=len(curated["relationships"]), total=len(curated["relationships"]))),
        "graph": graph(curated, records, locale, text, layout),
    })
    alternate_links, language_links = [], []
    for tag, bundle in bundles.items():
        href = base + ("index.html" if tag == "en" else f"{tag}/index.html")
        alternate_links.append(f'<link rel="alternate" hreflang="{h(tag)}" href="{href}">')
        active = ' aria-current="page"' if locale == tag else ""
        language_links.append(f'<a href="{href}" lang="{h(tag)}" hreflang="{h(tag)}"{active}>{h(bundle["_meta"]["name"])}</a>')
    parts["alternate_links"] = "\n".join(alternate_links)
    parts["language_links"] = f'<nav class="languages" aria-label="{h(text["language_label"])}">' + " ".join(language_links) + "</nav>" if len(bundles) > 1 else ""
    filters = []
    groups = []
    for kind in KINDS:
        symbol = f'<span class="type-symbol {kind}" aria-hidden="true">{SYMBOLS[kind]}</span>'
        disabled = " disabled" if not counts[kind] else ""
        filters.append(f'<button type="button" class="filter" data-filter="{kind}" aria-pressed="true" title="{h(text[kind + "_description"])}"{disabled}>{symbol}{h(text[kind])}<span class="count">{counts[kind]}</span></button>')
        entries = []
        for edge in curated["relationships"]:
            if edge["type"] != kind:
                continue
            arrow = "→" if kind in {"reference", "official_duplicate"} else "↔"
            sources = " ".join(f'<a href="{h(source["url"])}">{h(text["source_" + source["kind"]])} ↗</a>' for source in edge["sources"])
            entries.append(f'<li><div class="edge-pair"><a href="{issue_url(edge["from"])}">#{edge["from"]}</a><span aria-hidden="true">{arrow}</span><a href="{issue_url(edge["to"])}">#{edge["to"]}</a></div><div><p>{h(localized(edge["note"], locale))}</p><div class="sources">{sources}</div></div></li>')
        content = '<ol class="edge-ledger">' + "".join(entries) + "</ol>" if entries else f'<p class="empty-category">{h(text["no_relationships"])}</p>'
        groups.append(f'<details class="relationship-group" open><summary>{symbol}<span>{h(text[kind])}</span><span class="group-count">{counts[kind]}</span></summary><p class="type-description">{h(text[kind + "_description"])}</p>{content}</details>')
    parts["filters"] = "".join(filters)
    parts["relationship_groups"] = "".join(groups)
    issues = []
    for editorial in sorted(curated["issues"], key=lambda item: item["number"]):
        issue = records[editorial["number"]]
        reason = " / " + text.get(issue["state_reason"], text["unknown_reason"]) if issue["state"] == "closed" else ""
        state_label = f'{text[issue["state"]]}{reason} · {text["snapshot"]}'
        dates = f'{h(text["filed"])} <time datetime="{h(issue["created_at"])}">{h(issue["created_at"][:10])}</time> · {h(text["updated"])} <time datetime="{h(issue["updated_at"])}">{h(issue["updated_at"][:10])}</time>'
        issues.append(f'<article class="issue"><div class="issue-number"><a href="{issue["url"]}">#{issue["number"]} ↗</a><span class="issue-state {issue["state"]}" data-state-for="{issue["number"]}">{h(state_label)}</span></div><div class="issue-content"><h3><a href="{issue["url"]}">{h(issue["title"])}</a></h3><p>{h(localized(editorial["summary"], locale))}</p><p class="issue-dates">{dates}</p></div></article>')
    parts["issue_list"] = "".join(issues)
    config = {"locale": locale, "counterStartedAt": anchor["created_at"], "issueNumbers": sorted(records), "relationshipCount": len(curated["relationships"]), "messages": {key: value for key, value in text.items() if key != "_meta"}}
    # Inert JSON still needs escaping: an HTML parser recognizes a closing script
    # tag before a JavaScript or JSON parser can see it.
    parts["page_data"] = json.dumps(config, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return Template((ROOT / "site/page.html").read_text(encoding="utf-8")).substitute(parts)


def build(output=None):
    output = output or ROOT / "docs"
    curated, snapshot = read_json(ROOT / "data/curated.json"), read_json(ROOT / "data/snapshot.json")
    validate(curated, snapshot)
    bundles = load_locales(ROOT / "locales")
    layout = prepare_layout(curated)
    # Render every locale before touching generated files, so translation errors fail early.
    now = datetime.now(timezone.utc)
    pages = {locale: render(curated, snapshot, locale, bundles, layout, now) for locale in bundles}
    for locale, page in pages.items():
        destination = output if locale == "en" else output / locale
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "index.html").write_text(page, encoding="utf-8")
    (output / "assets").mkdir(exist_ok=True)
    for asset in ("style.css", "app.mjs", "counter.mjs", "refresh.mjs", "graph.mjs", "graph-physics.mjs"):
        shutil.copyfile(ROOT / "site" / asset, output / "assets" / asset)
    (output / "data").mkdir(exist_ok=True)
    for name, dataset in (("snapshot", snapshot), ("evidence", curated), ("layout", layout)):
        (output / "data" / f"{name}.json").write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Built {len(pages)} locale(s), {len(snapshot['issues'])} reports, {len(curated['relationships'])} relationships into {output}")


if __name__ == "__main__":
    build()
