from copy import deepcopy
from datetime import timedelta
from html.parser import HTMLParser
import json
import re
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build


class Page(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.tags = []
        self.feed(content)

    def handle_starttag(self, tag, attributes):
        self.tags.append((tag, dict(attributes)))


class StaticBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.curated = build.read_json(ROOT / "data/curated.json")
        cls.snapshot = build.read_json(ROOT / "data/snapshot.json")
        cls.bundles = build.load_locales(ROOT / "locales")

    def render(self, locale="en", bundles=None):
        return build.render(self.curated, self.snapshot, locale, bundles or self.bundles)

    def test_initial_locale_is_english(self):
        self.assertEqual(set(self.bundles), {"en"})
        self.assertIn('<html lang="en" dir="ltr">', self.render())
        self.assertNotIn('<nav class="languages"', self.render())

    def test_static_page_contains_every_issue_and_relationship(self):
        page = Page(self.render())
        nodes = [attrs for tag, attrs in page.tags if tag == "a" and "node" in attrs.get("class", "").split()]
        edges = [attrs for tag, attrs in page.tags if "data-edge-type" in attrs]
        issue_labels = [attrs for tag, attrs in page.tags if "data-state-for" in attrs]
        ledger_entries = [attrs for tag, attrs in page.tags if tag == "li"]
        self.assertEqual(len(nodes), len(self.curated["issues"]))
        self.assertEqual(len(issue_labels), len(nodes))
        self.assertEqual(len(edges), len(self.curated["relationships"]))
        self.assertEqual(len(ledger_entries), len(edges))
        self.assertEqual({int(node["data-node-id"]) for node in nodes}, {issue["number"] for issue in self.curated["issues"]})
        self.assertEqual(
            [(int(edge["data-edge-from"]), int(edge["data-edge-to"]), edge["data-edge-type"]) for edge in edges],
            [(edge["from"], edge["to"], edge["type"]) for edge in self.curated["relationships"]],
        )
        self.assertTrue(all(attrs["href"].startswith("https://github.com/openai/codex/issues/") for attrs in nodes))
        records = {issue["number"]: issue for issue in self.snapshot["issues"]}
        for node in nodes:
            state = records[int(node["data-node-id"])]["state"]
            self.assertEqual(node["data-node-state"], state)
            self.assertIn(self.bundles["en"][state], node["aria-label"])
            self.assertIn("snapshot", node["aria-label"])

    def test_counter_uses_current_time_and_exposes_original_anchor(self):
        anchor = next(issue for issue in self.snapshot["issues"] if issue["number"] == self.curated["counter_issue"])
        now = build.timestamp(self.snapshot["fetched_at"]) + timedelta(days=3)
        output = build.render(self.curated, self.snapshot, "en", self.bundles, now=now)
        days = (now - build.timestamp(anchor["created_at"])) // timedelta(days=1)
        self.assertIn(f'id="day-counter" class="digits">{days}<', output)
        encoded = output.split('<script id="page-data" type="application/json">', 1)[1].split('</script>', 1)[0]
        self.assertEqual(json.loads(encoded)["counterStartedAt"], anchor["created_at"])

    def test_recovery_markers_keep_tracker_state_separate_from_reviewed_comments(self):
        output = self.render()
        nodes = {int(attrs["data-node-id"]): attrs for tag, attrs in Page(output).tags if "data-node-id" in attrs}
        marked = {n for n, attrs in nodes.items() if attrs["data-node-state"] == "open" and attrs["data-node-recovery"] == "uncontradicted"}
        self.assertEqual(marked, {34227, 34309, 41501, 41535, 42661})
        self.assertEqual(nodes[41465]["data-node-recovery"], "mixed")
        self.assertEqual(nodes[41513]["data-node-state"], "closed")
        for number, attrs in nodes.items():
            self.assertEqual("Recovery reported" in attrs["aria-label"], number in marked)
            node_html = re.search(rf'<a class="node[^>]*data-node-id="{number}".*?</a>', output).group()
            self.assertEqual('class="recovery-mark"' in node_html, attrs["data-node-recovery"] == "uncontradicted")

    def test_escapes_issue_and_editorial_text(self):
        snapshot, curated = deepcopy(self.snapshot), deepcopy(self.curated)
        payload = '<img src=x onerror="alert(1)">'
        snapshot["issues"][0]["title"] = payload
        curated["issues"][0]["summary"]["en"] = payload
        output = build.render(curated, snapshot, "en", self.bundles)
        self.assertNotIn(payload, output)
        self.assertIn("&lt;img", output)
        self.assertFalse(any(key.startswith("on") for _, attrs in Page(output).tags for key in attrs))

    def test_expanded_graph_keeps_low_nodes_inside_its_viewport(self):
        curated = deepcopy(self.curated)
        curated["issues"][0]["position"][1] = 1400
        build.validate(curated, self.snapshot)
        page = Page(build.render(curated, self.snapshot, "en", self.bundles))
        svg = next(attrs for tag, attrs in page.tags if tag == "svg")
        width, height = map(float, svg["viewbox"].split()[2:])
        self.assertEqual(float(svg["height"]), height)
        for tag, rect in page.tags:
            if tag == "rect":
                self.assertGreaterEqual(float(rect["x"]), 0)
                self.assertGreaterEqual(float(rect["y"]), 0)
                self.assertLessEqual(float(rect["x"]) + float(rect["width"]), width)
                self.assertLessEqual(float(rect["y"]) + float(rect["height"]), height)

    def test_locale_discovery_fallback_subpaths_and_rtl(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "en.json").write_text(json.dumps(self.bundles["en"]), encoding="utf-8")
            (path / "fr-CA.json").write_text(json.dumps({"_meta": {"name": "Français", "direction": "ltr"}, "headline": "Où est la zone cliquable ?"}), encoding="utf-8")
            (path / "ar.json").write_text(json.dumps({"_meta": {"name": "العربية", "direction": "rtl"}}), encoding="utf-8")
            bundles = build.load_locales(path)
            self.assertEqual(len(bundles), 3)
            output = self.render("fr-CA", bundles)
            self.assertIn('href="../assets/style.css"', output)
            self.assertIn('href="../ar/index.html"', output)
            self.assertIn('href="../index.html"', output)
            self.assertIn("Où est la zone cliquable ?", output)
            self.assertIn(self.bundles["en"]["method_privacy"], output)
            self.assertIn('<html lang="ar" dir="rtl">', self.render("ar", bundles))

    def test_embedded_locale_data_cannot_escape_its_script_element(self):
        bundles = deepcopy(self.bundles)
        payload = '</script><script>alert("untrusted translation")</script>'
        bundles["en"]["headline"] = payload
        output = self.render(bundles=bundles)
        self.assertNotIn(payload, output)
        scripts = [attrs for tag, attrs in Page(output).tags if tag == "script"]
        self.assertEqual(len(scripts), 2)
        self.assertEqual(scripts[0]["src"], "./assets/app.mjs")
        encoded = output.split('<script id="page-data" type="application/json">', 1)[1].split('</script>', 1)[0]
        self.assertEqual(json.loads(encoded)["messages"]["headline"], payload)

    def test_offline_build_is_deterministic_and_project_relative(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            with patch("socket.create_connection", side_effect=AssertionError("Build must be offline")), patch("build.datetime") as clock:
                clock.now.return_value = build.timestamp(self.snapshot["fetched_at"]) + timedelta(days=3)
                build.build(Path(first))
                build.build(Path(second))
            outputs = {p.relative_to(first): p.read_bytes() for p in Path(first).rglob("*") if p.is_file()}
            for module in ("counter.mjs", "graph.mjs", "graph-physics.mjs"):
                self.assertEqual(outputs[Path("assets") / module], (ROOT / "site" / module).read_bytes())
            self.assertEqual(outputs, {p.relative_to(second): p.read_bytes() for p in Path(second).rglob("*") if p.is_file()})
            page = Page((Path(first) / "index.html").read_text(encoding="utf-8"))
            graph = next(attrs for tag, attrs in page.tags if tag == "svg")
            self.assertEqual(graph["data-layout-settled"], "true")
            layout = json.loads(outputs[Path("data/layout.json")])
            baked = re.findall(r'data-node-id="(\d+)".*?<rect x="([^"]+)" y="([^"]+)"', (Path(first) / "index.html").read_text(encoding="utf-8"))
            positions = {int(number): (float(x) + 80, float(y) + 29) for number, x, y in baked}
            for node in layout["nodes"]:
                self.assertAlmostEqual(positions[node["id"]][0], node["x"])
                self.assertAlmostEqual(positions[node["id"]][1], node["y"])
            ids = [attrs["id"] for _, attrs in page.tags if "id" in attrs]
            self.assertEqual(len(ids), len(set(ids)))
            for _, attrs in page.tags:
                for key in ("href", "src"):
                    target = attrs.get(key, "")
                    if not target or target.startswith("https:"):
                        continue
                    if target.startswith("#"):
                        self.assertIn(target[1:], ids)
                    else:
                        resolved = urlsplit(urljoin("https://example.com/project/index.html", target)).path
                        self.assertTrue(resolved.startswith("/project/"), resolved)
                        self.assertTrue((Path(first) / resolved.removeprefix("/project/")).is_file(), target)


if __name__ == "__main__":
    unittest.main()
