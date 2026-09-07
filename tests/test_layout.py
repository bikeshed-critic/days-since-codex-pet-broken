from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from layout import prepare_layout, validate_layout


class LayoutTests(unittest.TestCase):
    def test_cache_ignores_prose_but_invalidates_changed_topology(self):
        curated = {"issues": [{"number": 1, "position": [200, 200]}, {"number": 2, "position": [500, 200]}], "relationships": [{"from": 1, "to": 2}]}
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "layout.json"
            layout = prepare_layout(curated, cache)
            changed_text = deepcopy(curated)
            changed_text["issues"][0]["summary"] = {"en": "Different prose"}
            changed_text["relationships"].append({"from": 2, "to": 1})
            with patch("layout.subprocess.run", side_effect=AssertionError("Cache should be reused")):
                self.assertEqual(prepare_layout(changed_text, cache), layout)
            changed_text["relationships"] = []
            with patch("layout.subprocess.run", side_effect=RuntimeError("recompute")):
                with self.assertRaisesRegex(RuntimeError, "recompute"):
                    prepare_layout(changed_text, cache)
            saved = json.loads(cache.read_text(encoding="utf-8"))
            saved["layout"]["nodes"][0]["x"] = float("nan")
            cache.write_text(json.dumps(saved), encoding="utf-8")
            with patch("layout.subprocess.run", side_effect=RuntimeError("invalid cache")):
                with self.assertRaisesRegex(RuntimeError, "invalid cache"):
                    prepare_layout(curated, cache)

    def test_cached_layout_cannot_drop_or_overlap_issues(self):
        payload = {"nodes": [{"id": 1}, {"id": 2}], "width": 1120, "height": 580}
        for nodes in ([{"id": 1, "x": 200, "y": 200}], [{"id": 1, "x": 200, "y": 200}, {"id": 2, "x": 200, "y": 200}]):
            with self.assertRaises(ValueError):
                validate_layout({"nodes": nodes, "width": 1120, "height": 580}, payload)
