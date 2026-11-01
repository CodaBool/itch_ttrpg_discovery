# bug
- why did ai-assisted not get found on "https://soulartoys.itch.io/pocket-hero"

# jams
- use this search path https://itch.io/search?type=jams&jam_state=finished&q=author+or+title

# todo
- awards in newsletter
- make sure we are having the newsletter work correctly
- tests for agents
  - use the miniflare sqlite file in a one call manner
  - node --check and node --test
- split the worker readme to a doc and instead document code
- turn the mechanical AGENTS.md rules into checks (run from `npm run check`)
  - hidden items: every `FROM items` in `worker/src/` and `worker/email/` must include `removed_at` (allowlist ingest, ban, detail queue)
  - copied constants: compare `PAIR_TAGS`, `SOLO_TAGS`, `CATEGORIES`, `SEARCH_DEFINITIONS` in `worker/src/index.js` vs `scripts/local.mjs`, and the system→tag maps in `src/App.jsx` vs `worker/src/newsletter.js`
  - then shrink those AGENTS.md lines to a pointer to the check
