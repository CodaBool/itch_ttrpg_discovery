# Jam finder

Use this workflow when asked to discover or refresh the site's itch.io TTRPG jams. It is intended for a human-reviewed run roughly four times a year.

## Find candidates

1. Read `src/Jams.jsx` and note existing itch jam URLs. Compare by jam slug, ignoring a trailing `/entries` or slash. Also note current-year entries with `entries: null`; those need a status check.
2. Use the `agent-browser` skill to search itch.io jams. Search the current calendar year from January 1 through today's date, using TTRPG, tabletop, and relevant system or theme searches as needed. Search results can include older jams, so verify each candidate on its jam overview. Use the entries page for the submission count.
3. Exclude duplicates, unrelated jams, and jams that meet any of these rules:
   - Tiny or minimal TTRPG formats, including index card, bookmark, mini TTRPG, and minimalist jams. A mini-campaign is not automatically a mini-format jam.
   - One-page TTRPG jams.
   - Solo TTRPG jams.
   - Jams whose event dates are outside the current calendar year. Use event dates, not the year in a title or an entry's publication date.
   - Jams with fewer than 25 submissions, including ongoing jams. Reconsider an ongoing jam on a later run if it grows past 25.

Prefer playable games, adventures, and supplements over art assets, coloring pages, or software tools. These are priorities, not additional hard exclusions.

## Human review

Present a table of eligible missing jams before editing the list. Include the jam name and link, event dates or status, submission count, a short description based on the overview, and suggested site title and subtitle. Identify mixed-media or bundle jams clearly so the owner can judge their fit.

For each candidate, ask: **What should the title and subtitle be for this one?** Offer the suggested pair and **Ignore this one** as choices; accept custom wording. Batch questions when that is easier for the owner to answer, but record an explicit add or ignore decision for every candidate. Add only the approved candidates. An instruction to add the whole reviewed table counts as approval for those rows, subject to any stated exceptions.

## Update the list

- Add approved jams to `JAM_ENTRIES` in `src/Jams.jsx`, using `https://itch.io/jam/<slug>/entries`. Put the approved title in `title` and subtitle in `description`.
- For a completed jam, set `entries` to the verified submission count and `signal` to `"<count> entries"`. For a jam still accepting submissions, use `entries: null` and `signal: "ongoing"`; the review table can still show its current count.
- On every run, revisit current-year entries with `entries: null`. Once submissions close and the count is final, update `entries` and `signal`. Check the jam page rather than inferring status from the stored signal. Do not automatically remove older existing entries merely because they fail today's discovery rules.
- Verify the edited data and run `npm run build`. Report additions, ignored candidates, and completed jams whose counts were refreshed.
