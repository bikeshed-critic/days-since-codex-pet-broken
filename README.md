# Days since Codex pet broken

[Visit the live site](https://bikeshed-critic.github.io/days-since-codex-pet-broken/).

Some pets have found the mouse. Others are still networking.

A collection of reports about clicking, dragging, and the increasingly academic
relationship between the two. The reports now have a relationship graph.
Some of the pets have repaired theirs.

September 9 brought [reports of working input after an update](https://github.com/openai/codex/issues/34227#issuecomment-5604504387)
to Windows package `26.903.8094.0`. There are also [remaining failure reports](https://github.com/openai/codex/issues/44031)
on other builds and setups. The receipts now include the good news.

## We brought receipts

Every connection links back to GitHub. Actual references, official duplicate
decisions, similar symptoms, and root-cause theories get their own labels.
A bot suggesting a duplicate does not get promoted to chief diagnostician.

There is also a report where the transparent overlay swallows clicks across a
large area. For readers concerned that the pet was not intercepting enough input.

The clock counts from [#34227](https://github.com/openai/codex/issues/34227) to the
present, automatically. Its reporter now confirms working input; the number is
the report's age, not a running total of broken days. Graph borders track open and
closed tickets. The notes track what happened to the actual pets.

## Keeping the clock fed

Feeding time, with Python 3.12+ and Node.js 24:

```powershell
py -3 scripts/fetch_snapshot.py
py -3 scripts/build.py
```

Commit source and data changes to `main`; GitHub checks, builds, and publishes
the site. It also gives the graph time to settle before anyone arrives.
The generated `docs/` and layout cache stay out of git.

English for now. The infrastructure is ready for more languages; the mouse has
not expressed a preference.

CC0 for the code and original writing. Issue titles belong to their linked
sources. OpenAI Sans and [Codey](https://learn.chatgpt.com/docs/pets) are loaded
from OpenAI's servers and belong to OpenAI. No affiliation. Just a cursor and
some questions.
