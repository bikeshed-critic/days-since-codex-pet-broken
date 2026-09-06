# Local implementation plan

## Product contract

A facts-first, satirical observatory, with generic i18n and English displayed for now, of the
`openai/codex` desktop-pet input and hit-region issue network. This is an
independent editorial project. Issue links lead to GitHub. Do not reproduce
issue bodies, comments, attachments, user profiles, or diagnostic identifiers.

The five relationship classes are explicit GitHub references, official duplicate
decisions, editorial similarity, shared-mechanism hypotheses, and opposite
failures. A bot's potential-duplicate suggestion is an explicit reference, never
an official duplicate decision. A closed issue does not establish a shipped fix.

## Implementation

1. **Evidence:** curate a bounded initial set of 16 issues and cite the precise
   source for each relationship. Store editorial text by locale with English as the fallback. Record
   evidence review dates separately from mutable GitHub metadata.
2. **Snapshot:** use a Python standard-library collector to fetch only selected
   issues. Allowlist public metadata before writing `data/snapshot.json`.
   Public API access is the default; an explicit `--via-gh` option can use the
   installed CLI's authentication locally. Fail atomically if a fetch fails.
3. **Static generation:** emit complete English HTML, SVG network,
   issue index, and evidence ledger into `docs/`. Build offline, without npm or
   external runtime dependencies. All assets and links support a project Pages
   subpath. Locale files should support arbitrary additional languages without
   changes to page logic. `docs/` is the future
   branch-based GitHub Pages publishing directory.
4. **Interaction:** progressively enhance relationship filters. An explicit
   refresh button may fetch current issue status without authentication; it must
   preserve the snapshot on failures and keep live metadata separate from
   reviewed relationships. The site is useful without JavaScript or API access.
5. **Accuracy:** the counter measures completed 24-hour periods from #34227's
   creation to the snapshot capture, not continuous breakage or a fix SLA. State
   labels describe GitHub state only. Keep hypotheses visibly qualified.
6. **Validation:** test evidence provenance, reference integrity, allowlisting,
   date handling, escaping, offline generation, subpath links, and refresh failure
   behavior. Document build, refresh, and future Pages setup. Do not deploy.

## Visual direction

A dark technical observatory with lime reference points, an oversized factual
counter, colored and patterned edges, restrained satire, and a text equivalent
for the diagram. UI strings and editorial copy use locale resources, with only
English enabled initially; original issue titles remain in their source language
for traceability. Additional locales can opt into right-to-left layout.

## Boundaries for this task

Work directly on `main` in the saved checkout and preserve user changes; do not
create a feature branch yet. The repository-local identity is
`Bikeshed Critic <critic@bikeshed.invalid>` (verified already present).

On the user's subsequent explicit request, the remote initial commit was replaced
with `629c12e5e2b9f7f5e72adee0b93564607ce406e2`, using this identity for both
author and committer and preserving the original file tree. The push used an
explicit lease on the original remote tip. Local `main` and `origin/main` match;
the two redundant local feature branches were removed after verification.

Further pushes, deployment, history rewrites, and GitHub comment actions require
an explicit request. No deployment workflow is enabled by this implementation.
