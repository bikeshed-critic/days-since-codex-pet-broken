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

## Build and preview

The generator requires Python 3.10+ and no installed packages. It builds offline
from the checked-in snapshot, with complete HTML, an SVG graph, and a source
ledger. No JavaScript is needed to read the reports or follow links.

```powershell
py -3 scripts/build.py
py -3 -m http.server 8765 --bind 127.0.0.1 --directory docs
```

Open [the local preview](http://127.0.0.1:8765). Edit `site/`, `locales/`,
`data/`, or `scripts/`; `docs/` is generated output and should be rebuilt and
committed with its source changes. No external fonts, CDNs, or runtime framework
are required. Files use project-relative URLs for GitHub Pages subpaths.

The clock counts elapsed 24-hour periods from #34227's creation to the snapshot's
capture time. It does not establish continuous breakage or reset on issue closure.

## Internationalization

English is the only published locale initially. UI messages live in
`locales/en.json`; editorial fields in `data/curated.json` are keyed by locale.
To add a language, add `locales/<language-tag>.json` with `_meta.name`,
`_meta.direction` (`ltr` or `rtl`), and translated message keys, then rebuild.
Missing messages and editorial translations fall back to English. Preserve
`{number}`, `{count}`, `{total}`, `{visible}`, and `{time}` placeholders where used.

The builder discovers locale files and emits additional routes at
`docs/<language-tag>/index.html`, plus language navigation and alternate links.
English stays at `docs/index.html`. Original issue titles stay in their source
language. If withdrawing a previously published locale, also remove its generated
directory from `docs/` before committing.

## Validation

Run evidence, collector, and static-generation tests:

```powershell
py -3 -m unittest discover -s tests -p 'test_*.py'
```

Tests cover provenance, privacy allowlisting, snapshot preservation on failure,
counter semantics, escaping, locale fallback and right-to-left metadata,
deterministic offline builds, and links under a project subpath.

## Future GitHub Pages publication

Publication is not enabled by this work. When explicitly requested, the generated
`docs/` directory can be published using GitHub Pages' **Deploy from a branch**
source, selecting **main** and **/docs**. The `.nojekyll` file keeps the generated
site static. No Actions workflow, secrets, server, or GitHub token is required.
See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

See `PLAN.md` for implementation scope. Code and original editorial content use
the repository's CC0 dedication; GitHub issue titles remain attributable to their
linked sources. This project is not affiliated with OpenAI.
