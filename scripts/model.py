"""Shared evidence and snapshot validation, without network access."""

from datetime import date, datetime
import re

KINDS = ("reference", "official_duplicate", "similarity", "hypothesis", "opposite")
SOURCE_KINDS = {"issue_body", "community_comment", "bot_suggestion", "maintainer_decision", "duplicate_event"}
PUBLIC_FIELDS = {"number", "title", "url", "state", "state_reason", "created_at", "updated_at", "closed_at", "labels"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, "Timestamps must specify a timezone")
    return parsed


def elapsed_days(start, end):
    seconds = (timestamp(end) - timestamp(start)).total_seconds()
    require(seconds >= 0, "Counter cannot end before its anchor")
    return int(seconds // 86400)


def localized(value):
    require(isinstance(value, dict) and "en" in value, "An English fallback is required")
    require(all(re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*", locale) for locale in value), "Invalid locale tag")
    require(all(isinstance(text, str) and text.strip() for text in value.values()), "Translations cannot be empty")


def validate(curated, snapshot):
    require(set(curated) == {"schema_version", "repository", "reviewed_at", "counter_issue", "issues", "relationships"}, "Unknown curated field")
    require(set(snapshot) == {"schema_version", "repository", "fetched_at", "issues"}, "Unknown snapshot field")
    require(curated["schema_version"] == snapshot["schema_version"] == 1, "Unsupported schema")
    require(curated["repository"] == snapshot["repository"] == "openai/codex", "Unexpected repository")
    captured = timestamp(snapshot["fetched_at"])
    reviewed = date.fromisoformat(curated["reviewed_at"])
    require(reviewed <= captured.date(), "Evidence review is later than snapshot")
    ids = [issue["number"] for issue in curated["issues"]]
    require(ids and len(ids) == len(set(ids)), "Issue set must be nonempty and unique")
    require(all(type(number) is int and number > 0 for number in ids), "Invalid issue number")
    require(curated["counter_issue"] in ids, "Counter anchor is absent")
    captured_ids = [issue["number"] for issue in snapshot["issues"]]
    require(len(captured_ids) == len(set(captured_ids)) and set(ids) == set(captured_ids), "Snapshot coverage mismatch")
    for issue in curated["issues"]:
        require(set(issue) == {"number", "position", "label", "summary"}, "Unknown editorial issue field")
        localized(issue["label"])
        localized(issue["summary"])
        position = issue["position"]
        require(isinstance(position, list) and len(position) == 2, "Invalid graph position")
        require(all(type(value) is int for value in position), "Graph positions must be integers")
        require(85 <= position[0] <= 1035 and 40 <= position[1] <= 550, "Graph node outside canvas")
    for issue in snapshot["issues"]:
        require(set(issue) == PUBLIC_FIELDS, "Snapshot contains unexpected fields; bodies/comments are forbidden")
        require(isinstance(issue["title"], str) and bool(issue["title"].strip()), "Missing issue title")
        require(issue["url"] == f"https://github.com/openai/codex/issues/{issue['number']}", "Unexpected issue URL")
        require(issue["state"] in {"open", "closed"}, "Invalid issue state")
        require(issue["state_reason"] in {None, "completed", "not_planned", "reopened", "duplicate"}, "Unknown state reason")
        created, updated = timestamp(issue["created_at"]), timestamp(issue["updated_at"])
        require(created <= updated <= captured, "Inconsistent issue timestamps")
        if issue["closed_at"] is not None:
            require(created <= timestamp(issue["closed_at"]) <= updated, "Invalid closure timestamp")
        require((issue["state"] == "closed") == (issue["closed_at"] is not None), "Closure/state mismatch")
        require(isinstance(issue["labels"], list) and all(isinstance(label, str) for label in issue["labels"]), "Invalid labels")
    seen = set()
    for edge in curated["relationships"]:
        require(set(edge) == {"from", "to", "type", "sources", "note"}, "Unknown relationship field")
        require(edge["from"] in ids and edge["to"] in ids and edge["from"] != edge["to"], "Invalid relationship endpoints")
        require(edge["type"] in KINDS, "Unknown relationship type")
        key = (edge["from"], edge["to"], edge["type"])
        if edge["type"] not in {"reference", "official_duplicate"}:
            key = (*sorted(key[:2]), key[2])
        require(key not in seen, "Duplicate relationship")
        seen.add(key)
        localized(edge["note"])
        require(isinstance(edge["sources"], list) and bool(edge["sources"]), "Every relationship needs provenance")
        for source in edge["sources"]:
            require(set(source) == {"url", "kind"}, "Unknown evidence field")
            require(source["kind"] in SOURCE_KINDS, "Unknown source kind")
            match = re.fullmatch(r"https://github\.com/openai/codex/issues/(\d+)(?:#(?:issuecomment-|event-)\d+)?", source["url"])
            require(match and int(match[1]) in {edge["from"], edge["to"]}, "Source must belong to a relationship endpoint")
            if source["kind"] != "issue_body":
                require("#" in source["url"], "Comment or decision evidence needs a permalink")
        if edge["type"] == "official_duplicate":
            require(all(source["kind"] in {"maintainer_decision", "duplicate_event"} for source in edge["sources"]), "A suggestion or community comment cannot establish an official duplicate")
        if edge["type"] == "reference":
            require(any(f"/issues/{edge['from']}" == source["url"].split("#")[0].removeprefix("https://github.com/openai/codex") for source in edge["sources"]), "Reference direction must match its source issue")
    anchor = next(issue for issue in snapshot["issues"] if issue["number"] == curated["counter_issue"])
    elapsed_days(anchor["created_at"], snapshot["fetched_at"])
