"""Compute and cache build-only graph positions with the shared JavaScript physics."""

import hashlib
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def validate_layout(layout, payload):
    if layout["width"] != payload["width"] or layout["height"] != payload["height"]:
        raise ValueError("Unexpected layout bounds")
    nodes = layout["nodes"]
    if len(nodes) != len(payload["nodes"]) or {node["id"] for node in nodes} != {node["id"] for node in payload["nodes"]}:
        raise ValueError("Layout must include every reviewed issue exactly once")
    for node in nodes:
        x, y = node["x"], node["y"]
        if not math.isfinite(x) or not math.isfinite(y) or not (88 <= x <= layout["width"] - 88 and 37 <= y <= layout["height"] - 37):
            raise ValueError("Layout node outside the viewport")
        for other in nodes:
            if node["id"] != other["id"] and abs(x - other["x"]) < 160 and abs(y - other["y"]) < 58:
                raise ValueError("Overlapping layout labels")
    return layout


def prepare_layout(curated, cache=None):
    nodes = sorted((dict(id=issue["number"], x=issue["position"][0], y=issue["position"][1]) for issue in curated["issues"]), key=lambda node: node["id"])
    # Text, issue states, citation URLs, and duplicate edges do not affect geometry.
    pairs = sorted({tuple(sorted((edge["from"], edge["to"]))) for edge in curated["relationships"]})
    payload = {"nodes": nodes, "relationships": [dict(zip(("from", "to"), pair)) for pair in pairs], "width": 1120, "height": max(580, max(node["y"] for node in nodes) + 50)}
    encoded = json.dumps(payload, sort_keys=True)
    sources = "".join((ROOT / path).read_text(encoding="utf-8") for path in ("scripts/anneal.mjs", "site/graph-physics.mjs", "scripts/layout.py"))
    fingerprint = hashlib.sha256((encoded + sources).encode("utf-8")).hexdigest()
    cache = cache or ROOT / ".cache/graph-layout.json"
    try:
        saved = json.loads(cache.read_text(encoding="utf-8"))
        if saved["fingerprint"] == fingerprint:
            return validate_layout(saved["layout"], payload)
    except (OSError, ValueError, KeyError, TypeError):
        pass
    result = subprocess.run(["node", str(ROOT / "scripts/anneal.mjs")], input=encoded, text=True, encoding="utf-8", capture_output=True, timeout=90, check=True)
    layout = validate_layout(json.loads(result.stdout), payload)
    cache.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache.with_suffix(".tmp")
    temporary.write_text(json.dumps({"fingerprint": fingerprint, "layout": layout}, indent=2) + "\n", encoding="utf-8")
    temporary.replace(cache)
    return layout
