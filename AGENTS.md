# AGENTS.md

Discovery site for new indie TTRPGs on itch.io. All parts share one Cloudflare D1 database (`itch-rpg-feed`). `npm run` scripts in `package.json` are the commands; there are no tests or linter.

## Pieces

| Piece | Entry | Config | Job |
|---|---|---|---|
| API + ingest worker | `worker/src/index.js` | `wrangler.toml` | Serves `/api/*`. Cron runs one itch `newest/*.xml` search per minute, with a cursor kept in `ingest_state`. |
| Detail worker | `worker/detail/detail.js` | `worker/detail/wrangler.toml` | Cron scrapes 5 item pages a minute for rating, engagement, AI disclosure, tags, and language. Hides items that fail the rules and deletes items whose page is gone. |
| Email worker | `worker/email/email.js` | `worker/email/wrangler.toml` | Sends the monthly newsletter through an external mail worker and handles unsubscribe. |
| Frontend | `src/main.jsx` → `src/App.jsx` | `wrangler.frontend.toml`, `vite.config.js` | React 19 + Tailwind 4 SPA (discover, newsletter builder, jams). Deployed as static assets from `dist/` by Cloudflare's git integration when you push, so files in `public/` must be committed to go live. The newsletter links to `public/ennie.webp`. |
| Local scripts | `scripts/*.mjs` | env vars | Write to D1 through the Cloudflare HTTP API. `local.mjs` drives the user's logged-in Chrome over CDP on port 9222; `detail.mjs` launches its own headless Puppeteer. |

The routes, crons, and vars of all three workers are documented in `worker/src/readme.md`, and the local scraper setup in `scripts/readme.md`. Update those docs when you change a route, a response shape, or an env var.

For quarterly itch jam discovery, candidate review, or ongoing jam count updates, read `docs/jam-finder.md`.

## Shared code and duplicated constants

- `worker/detail/shared.js` is imported by both the detail worker and `scripts/detail.mjs`. Keep it runtime-neutral, so it works in both Workers and Node.
- `worker/src/newsletter.js` is imported by the API worker (newsletter preview) and the email worker (the actual send).
- `src/awards.js` is imported by the Jams page and by `worker/src/newsletter.js`, which shows the ENNIE badge while the list has an `ENNIE` entry for the current year. Keep it plain data so it bundles in both.
- These constants are copied by hand between files. When you change one copy, update all of them:
  - The tag and category lists (`PAIR_TAGS`, `SOLO_TAGS`, `CATEGORIES`, `SEARCH_DEFINITIONS`) live in `worker/src/index.js` and `scripts/local.mjs`.
  - The system → tag map lives in `SYSTEM_DEFINITIONS` and `QUERY_SYSTEM_KEY_BY_PARAM` in `src/App.jsx`, and in `SYSTEM_TAGS_BY_KEY` and `QUERY_PARAM_BY_SYSTEM_KEY` in `worker/src/newsletter.js`.

## Detail scrape

- Both detail paths share their rules through `worker/detail/shared.js`: the excluded-tag list, the AI-assisted removal, the low-rating removal, and the HTML parsing. Change a rule there, not in one caller.
- Both paths save through `applyDetailResult`. A rule failure hides the item rather than deleting it, by setting `items.removed_reason` (one of `REMOVAL_REASONS`) and `removed_at`. A hidden row stays in the detail queue, and a later check that passes clears both columns. Only a 404 deletes the row. To add a rule, add its reason to `REMOVAL_REASONS` and a check to `findRemovalReason`. The action counts in both callers come from `DETAIL_ACTIONS`.
- Language detection is the one split: `scripts/detail.mjs` uses `cld`, a native Node module that can't run in Workers, and the worker uses `tinyld`. Both store ISO 639-1 codes, and store English or an uncertain result as null.
- The worker's queue is ordered by `items.detail_checked_at` (never-checked items first, then anything older than `DETAIL_STALE_DAYS`). Ingest also bumps `updated_at`, so `updated_at` can't tell you when detail last ran.
- Worker vars (`DETAIL_STALE_DAYS`, `DETAIL_REQUEST_TIMEOUT_MS`, `DETAIL_USER_AGENT`) belong in `[vars]` in `worker/detail/wrangler.toml`. A deploy replaces vars set in the dashboard.

## Database

- To change the schema, add the next numbered file in `worker/migrations/`. Leave existing migrations as they are.
- `items.source` is a JSON array of `{category, category_slug, term, source_search, fetched_url}`. A new search hit gets merged into the array; it never replaces it.
- Every query that reads items for users must include `WHERE removed_at IS NULL`. Today that is `/api/items` and the newsletter preview in `worker/src/index.js`, and `loadItems` in `worker/email/email.js`.
- Ingest leaves a hidden row hidden, because it only merges into `source` and never touches `removed_*`. A deleted row is different: the next ingest that finds it adds it back. To keep one out for good, add a row to `ingest_bans`, through `POST /api/admin/ban` with the `x-admin-token` header.

## Secrets and side effects

- `.env` is kept **outside** the repo (`../.env`; see `envDir` in `vite.config.js` and the `--env-file=../.env` scripts) on purpose, so agents cannot read it. Leave it unread. Take the variable names from `.example.env` or from the code.
- The Wrangler configs point at the **production** D1 database. These commands change live data, so ask before running them: `worker:deploy*`, `wrangler deploy --config worker/detail/wrangler.toml` (the detail worker has no npm deploy script), `worker:d1:migrate`, `worker:dev-detail` (it runs `--remote`), `npm run wipe`, `npm run local`, and `npm run detail`.
- For safe local work, use `npm run dev` (the frontend, calling the deployed API unless `VITE_API_BASE_URL` is set) and `npm run worker:d1:migrate:local` with `npm run worker:dev`.
- Safe ways to test the detail scrape:
  - Local script: `DETAIL_DRY_RUN=true DETAIL_MAX_ITEMS=10 npm run detail` reads prod D1 and writes nothing.
  - Deployed worker: `POST https://itch-ttrpg-discovery-detail.codabool.workers.dev/api/detail/step` with `{"dryRun":true}` writes nothing.
  - Worker code before a deploy: `npx wrangler dev --config worker/detail/wrangler.toml --persist-to <scratch dir>` runs it in workerd against a throwaway D1. Apply migrations to it first with `wrangler d1 migrations apply itch-rpg-feed --local` using the same `--config` and `--persist-to`.
  - To compare a scraped value with the real page, open the item in the user's Chrome over CDP on port 9222.

## Conventions

- Plain JavaScript ES modules, no TypeScript. Match the style of the file you're editing: the frontend uses 4-space indentation, and the worker and scripts use 2-space.
- `private.md` is the owner's notes file and `*.junk.*` files are scratch. Leave both alone unless asked.
- Coverage gaps are deliberate: `readme.md` lists the tags that are left out on purpose. Check that list before adding tags.
