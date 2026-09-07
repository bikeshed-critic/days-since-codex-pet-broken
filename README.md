# Days since Codex pet broken

[Visit the live site](https://bikeshed-critic.github.io/days-since-codex-pet-broken/).

The pet is right there. The mouse has a different opinion.

A collection of reports about clicking, dragging, and the increasingly academic
relationship between the two. The reports now have a relationship graph.
The pet and the cursor are still working on theirs.

## We brought receipts

Every connection links back to GitHub. Actual references, official duplicate
decisions, similar symptoms, and root-cause theories get their own labels.
A bot suggesting a duplicate does not get promoted to chief diagnostician.

There is also a report where the transparent overlay swallows clicks across a
large area. For readers concerned that the pet was not intercepting enough input.

The clock counts from [#34227](https://github.com/openai/codex/issues/34227) to the
saved snapshot. Closing a ticket does not reset it. A closed ticket and a draggable
pet remain separate accomplishments.

## Keeping the clock fed

Feeding time, with Python 3.10+:

```powershell
py -3 scripts/fetch_snapshot.py
py -3 scripts/build.py
```

Commit the updated `docs/`; pushing to `main` puts it on the site.

English for now. The infrastructure is ready for more languages; the mouse has
not expressed a preference.

CC0 for the code and original writing. Issue titles belong to their linked
sources. OpenAI Sans and [Codey](https://learn.chatgpt.com/docs/pets) are loaded
from OpenAI's servers and belong to OpenAI. No affiliation. Just a cursor and
some questions.
