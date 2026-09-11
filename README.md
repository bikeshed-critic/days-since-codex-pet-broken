# Days since Codex pet broken

[Visit the live site](https://bikeshed-critic.github.io/days-since-codex-pet-broken/).

Some pets have found the mouse. Others are still networking.

A collection of reports about clicking, dragging, and the increasingly academic
relationship between the two. The reports now have a relationship graph.
Some of the pets have repaired theirs.

The September 11 review adds [working input on Windows package `26.903.9818.0`](https://github.com/openai/codex/issues/41535#issuecomment-5625133108)
and [another pet that can be dragged again](https://github.com/openai/codex/issues/43789#issuecomment-5622038946).
Package `26.908.3777.0` has [a separate report where the pet window crashes](https://github.com/openai/codex/issues/44739).
The mouse is making progress; the window has other plans.
That crash gets its own receipt, outside the input-failure graph.

## We brought receipts

Every connection links back to GitHub. Actual references, official duplicate
decisions, similar symptoms, and root-cause theories get their own labels.
A bot suggesting a duplicate does not get promoted to chief diagnostician.

There is also a report where the transparent overlay swallows clicks across a
large area. For readers concerned that the pet was not intercepting enough input.

The clock counts from [#34227](https://github.com/openai/codex/issues/34227) to the
present, automatically. Its reporter now confirms working input; the number is
the report's age, not a running total of broken days. Graph borders track open and
closed tickets. A purple dash marks an open report with recovery comments and no
later contradiction in our review. The notes track what happened to the actual pets.

## Keeping the clock fed

Feeding time, with Python 3.12+ and Node.js 24:

```powershell
py -3 scripts/fetch_snapshot.py
py -3 scripts/build.py
```

Review comments before updating an issue's optional `recovery` record in
`data/curated.json`: keep the source comment links, use `uncontradicted` for
reported recovery without later contrary evidence, and `mixed` when later reports
qualify it. Temporary workarounds and partial recoveries do not earn a dash.
The metadata fetch and the site's live status check do not review comments.

Commit source and data changes to `main`; GitHub checks, builds, and publishes
the site. It also gives the graph time to settle before anyone arrives.
The generated `docs/` and layout cache stay out of git.

English for now. The infrastructure is ready for more languages; the mouse has
not expressed a preference.

CC0 for the code and original writing. Issue titles belong to their linked
sources. OpenAI Sans is loaded from OpenAI's servers. [Codey](https://learn.chatgpt.com/docs/pets)
uses the bundled v6 sprite sheet from Codex Windows package `26.903.8094.0`.
Both belong to OpenAI and are outside this project's CC0 dedication.
No affiliation. Just a cursor and some questions.
