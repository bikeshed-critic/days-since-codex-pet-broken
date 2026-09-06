# Days since Codex pet broken

An independent, facts-first, satirical observatory of `openai/codex` desktop-pet
input and hit-region reports. Generic i18n, with English enabled initially.

The initial evidence set contains 16 selected reports and 24 reviewed
relationships. Explicit references, official duplicate decisions, editorial
similarity, mechanism hypotheses, and opposite failures remain separate.
Automated potential-duplicate suggestions are references, not official decisions.

## Evidence and snapshots

- `data/curated.json`: editorial selection, short summaries, and source permalinks.
- `data/snapshot.json`: captured public issue metadata, with its capture time.
- `scripts/fetch_snapshot.py`: Python 3.10+ standard-library snapshot collector.

Refresh metadata from the public API, or explicitly use an already authenticated
local GitHub CLI:

```powershell
py -3 scripts/fetch_snapshot.py
# Alternatively:
py -3 scripts/fetch_snapshot.py --via-gh
```

No GitHub token is written to the project. Issue bodies, comments, attachments,
profiles, and diagnostic identifiers are not persisted. A failed fetch leaves the
existing snapshot intact. Metadata refresh does not re-review editorial evidence.

Run evidence validation and collector tests:

```powershell
py -3 -m unittest discover -s tests -p 'test_*.py'
```

See `PLAN.md` for implementation scope. Code and original editorial content use
the repository's CC0 dedication; GitHub issue titles remain attributable to their
linked sources. This project is not affiliated with OpenAI.
