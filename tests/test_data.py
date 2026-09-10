from contextlib import redirect_stderr
from copy import deepcopy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_snapshot
from model import elapsed_days, validate


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.curated = json.loads((ROOT / "data/curated.json").read_text(encoding="utf-8"))
        self.snapshot = json.loads((ROOT / "data/snapshot.json").read_text(encoding="utf-8"))

    def test_checked_in_evidence_is_consistent(self):
        validate(self.curated, self.snapshot)

    def test_recovery_requires_a_reviewed_status_and_same_issue_comment_sources(self):
        for recovery in ({"status": "uncontradicted", "sources": []},
                         {"status": "fixed", "sources": ["https://github.com/openai/codex/issues/21359#issuecomment-1"]},
                         {"status": "uncontradicted", "sources": ["https://github.com/openai/codex/issues/34227#issuecomment-1"]},
                         {"status": "uncontradicted", "sources": ["https://github.com/openai/codex/issues/21359"]}):
            with self.subTest(recovery=recovery):
                curated = deepcopy(self.curated)
                curated["issues"][0]["recovery"] = recovery
                with self.assertRaises(ValueError):
                    validate(curated, self.snapshot)

    def test_counter_counts_elapsed_days_not_calendar_boundaries(self):
        self.assertEqual(elapsed_days("2026-09-01T23:59:00Z", "2026-09-02T00:01:00Z"), 0)
        self.assertEqual(elapsed_days("2026-09-01T08:00:00+08:00", "2026-09-03T00:00:00Z"), 2)
        with self.assertRaises(ValueError):
            elapsed_days("2026-09-03T00:00:00Z", "2026-09-01T00:00:00Z")

    def test_snapshot_allowlist_rejects_accidental_comment_storage(self):
        for field in ("body", "comments", "user", "token"):
            with self.subTest(field=field):
                data = deepcopy(self.snapshot)
                data["issues"][0][field] = "must not be published"
                with self.assertRaisesRegex(ValueError, "unexpected fields"):
                    validate(self.curated, data)

    def test_cleaning_discards_private_and_unneeded_response_fields(self):
        public = self.snapshot["issues"][0]
        raw = public | {"html_url": public["url"], "labels": [{"name": label} for label in public["labels"]], "body": "private diagnostic", "user": {"login": "somebody"}, "comments": 7, "unexpected_new_api_field": "discard"}
        self.assertEqual(fetch_snapshot.clean_issue(raw), public)

    def test_bot_and_community_refs_cannot_be_official_duplicates(self):
        for kind in ("bot_suggestion", "community_comment"):
            data = deepcopy(self.curated)
            edge = next(edge for edge in data["relationships"] if edge["sources"][0]["kind"] == kind)
            edge["type"] = "official_duplicate"
            with self.assertRaisesRegex(ValueError, "cannot establish an official duplicate"):
                validate(data, self.snapshot)

    def test_rejects_missing_or_external_evidence(self):
        for sources in ([], [{"url": "https://example.com/41513", "kind": "issue_body"}], [{"url": "https://github.com/openai/codex/issues/99999", "kind": "issue_body"}]):
            data = deepcopy(self.curated)
            data["relationships"][0]["sources"] = sources
            with self.assertRaises(ValueError):
                validate(data, self.snapshot)

    def test_reference_direction_must_match_source(self):
        data = deepcopy(self.curated)
        edge = data["relationships"][0]
        edge["from"], edge["to"] = edge["to"], edge["from"]
        with self.assertRaisesRegex(ValueError, "direction"):
            validate(data, self.snapshot)

    def test_closure_does_not_reset_counter(self):
        anchor = next(issue for issue in self.snapshot["issues"] if issue["number"] == self.curated["counter_issue"])
        before = elapsed_days(anchor["created_at"], self.snapshot["fetched_at"])
        anchor.update(state="closed", state_reason="completed", closed_at=anchor["updated_at"])
        validate(self.curated, self.snapshot)
        self.assertEqual(before, elapsed_days(anchor["created_at"], self.snapshot["fetched_at"]))

    def test_locale_keys_are_extensible_with_english_fallback(self):
        self.curated["issues"][0]["label"]["fr-CA"] = "Écran secondaire"
        validate(self.curated, self.snapshot)
        del self.curated["issues"][0]["label"]["en"]
        with self.assertRaisesRegex(ValueError, "English fallback"):
            validate(self.curated, self.snapshot)

    def test_partial_or_duplicate_snapshot_is_rejected(self):
        for data in (self.snapshot | {"issues": self.snapshot["issues"][:-1]}, self.snapshot | {"issues": self.snapshot["issues"] + [self.snapshot["issues"][0]]}):
            with self.assertRaisesRegex(ValueError, "coverage mismatch"):
                validate(self.curated, data)

    def test_failed_collection_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "data").mkdir()
            (root / "data/curated.json").write_text(json.dumps(self.curated), encoding="utf-8")
            snapshot = root / "data/snapshot.json"
            snapshot.write_text("keep this exact snapshot", encoding="utf-8")
            with patch.object(fetch_snapshot, "ROOT", root), patch.object(fetch_snapshot, "collect", side_effect=TimeoutError("offline")), patch.object(sys, "argv", ["fetch_snapshot.py"]), redirect_stderr(io.StringIO()):
                self.assertEqual(fetch_snapshot.main(), 1)
            self.assertEqual(snapshot.read_text(encoding="utf-8"), "keep this exact snapshot")


if __name__ == "__main__":
    unittest.main()
