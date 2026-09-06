"""Fetch public issue metadata; never persist GitHub bodies or comments."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "openai/codex"


def clean_issue(raw):
    """Construct a public record instead of deleting known-sensitive fields."""
    return {
        "number": raw["number"],
        "title": raw["title"],
        "url": raw["html_url"],
        "state": raw["state"],
        "state_reason": raw.get("state_reason"),
        "created_at": raw["created_at"],
        "updated_at": raw["updated_at"],
        "closed_at": raw.get("closed_at"),
        "labels": sorted(label["name"] for label in raw.get("labels", [])),
    }


def fetch_issue(number, via_gh=False):
    endpoint = f"repos/{REPOSITORY}/issues/{number}"
    if via_gh:
        result = subprocess.run(
            ["gh", "api", endpoint], capture_output=True, text=True, encoding="utf-8"
        )
        if result.returncode:
            raise RuntimeError(f"GitHub CLI could not read issue #{number}")
        raw = json.loads(result.stdout)
    else:
        request = Request(
            f"https://api.github.com/{endpoint}",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "pet-issue-observatory"},
        )
        with urlopen(request, timeout=20) as response:
            raw = json.load(response)
    if raw.get("number") != number or "pull_request" in raw:
        raise ValueError(f"Unexpected response for issue #{number}")
    return clean_issue(raw)


def collect(curated, via_gh=False, fetcher=fetch_issue):
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(lambda issue: fetcher(issue["number"], via_gh), curated["issues"]))
    return {
        "schema_version": 1,
        "repository": REPOSITORY,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "issues": sorted(records, key=lambda issue: issue["number"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--via-gh", action="store_true", help="Use locally authenticated gh; no credential is exported")
    options = parser.parse_args()
    from model import validate

    curated = json.loads((ROOT / "data/curated.json").read_text(encoding="utf-8"))
    destination = ROOT / "data/snapshot.json"
    try:
        snapshot = collect(curated, options.via_gh)
        validate(curated, snapshot)
        temporary = destination.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(destination)
    except Exception as error:
        print(f"Snapshot unchanged: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    print(f"Captured {len(snapshot['issues'])} issues at {snapshot['fetched_at']}; no bodies or comments saved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
