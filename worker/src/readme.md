# Worker Routes

Every HTTP route and cron in the three workers. All three share the `itch-rpg-feed` D1 database.

| Worker | Code | Production URL |
|---|---|---|
| API + ingest | `worker/src/index.js` | `https://itch-ttrpg-discovery.codabool.workers.dev` |
| Detail | `worker/detail/detail.js` | `https://itch-ttrpg-discovery-detail.codabool.workers.dev` |
| Email | `worker/email/email.js` | `https://itch-ttrpg-discovery-email.codabool.workers.dev` |

Local dev for the API worker is `npm run worker:dev` at `http://127.0.0.1:8787`.

## Common Behavior

- Responses are JSON, except the email worker's unsubscribe page, which is HTML.
- CORS headers are enabled for `GET`, `POST`, and `OPTIONS`.
- `OPTIONS` requests return `{ "ok": true }` for preflight support.
- An unknown path returns `{ "error": "Not found" }` with HTTP `404`.
- Options can be sent as query params or as a JSON body, unless a route says otherwise.

# API + ingest worker

## `GET /api/items`

Lists items, newest `updated_at` first. Items the detail worker has hidden (`removed_at` set) are left out.

Query parameters:
- `q`: text search against `title` and `description`.
- `category`: matches a source `category` or `category_slug`.
- `tag`: matches a source `term`.
- `limit`: rows read from D1 before the filters above run. Default and max `5000`, min `1`.
- `offset`: rows to skip. Default `0`.

Because the filters run after the `LIMIT`, `count` can be lower than `limit` even when more rows match.

```json
{
  "count": 42,
  "items": [
    {
      "url": "https://...",
      "source": [
        {
          "category": "Tool",
          "category_slug": "tools",
          "term": "horror",
          "source_search": "tag-horror",
          "fetched_url": "https://...xml"
        }
      ],
      "title": "...",
      "description": "...",
      "image_url": "...",
      "price": "...",
      "publish_date": "...",
      "update_date": "...",
      "author": "...",
      "author_url": "https://...",
      "language": null,
      "rating": "4.5over3",
      "engagement": 2,
      "ai": "no ai",
      "first_seen_at": "...",
      "updated_at": "..."
    }
  ],
  "pagination": { "limit": 5000, "offset": 0, "has_more": false, "next_offset": 5000 },
  "filters": { "category": "", "tag": "", "q": "", "limit": 5000, "offset": 0 }
}
```

`language` is an ISO 639-1 code, or null for English or unknown. `rating`, `engagement`, `ai`, and `language` stay null until the detail worker has checked the item.

## `GET /api/metadata`

Returns the static category and tag lists the worker searches with.

```json
{
  "categories": [{ "name": "Tool", "slug": "tools" }],
  "tags": ["horror", "..."]
}
```

## `POST /api/newsletter/preview`

Builds the newsletter for a set of preferences without sending it. It uses the same code as the monthly send (`worker/src/newsletter.js`), and leaves out hidden items.

The JSON body is a preference object:
- `title`
- `systems`: a map of system key to score
- `englishOnly`, `addGameAssets`, `addToolsMiscGameMods`: booleans, default `true`
- `minRatings`: `0`-`10`
- `excludedCreators`: an array of author names

```json
{ "count": 12, "items": [], "html": "<!doctype html>..." }
```

## `GET /api/newsletter/preferences?email=...`

Returns a subscriber's stored preferences.

```json
{ "exists": true, "email": "...", "preference_json": {}, "created_at": "...", "updated_at": "..." }
```

The response is `{ "exists": false }` when there's no subscription, and `400` when `email` is missing.

## `POST /api/newsletter/preferences`

Creates or replaces a subscription. JSON body: `{ "email": "...", "preference": { ... } }`. Both fields are required, otherwise it returns `400`.

```json
{ "ok": true, "email": "...", "replaced": false }
```

## `GET /api/admin/searches`

Debug helper. It lists the XML feed URLs that would be requested for a selection, and doesn't fetch or write anything.

- `category`: comma-separated slugs or names, e.g. `tools,game-assets`.
- `tag`: comma-separated tags.
- `maxSearches`: cap on the list. Default `120`.

```json
{
  "count": 10,
  "selected_categories": ["tools"],
  "selected_terms": ["horror"],
  "searches": [
    {
      "category": "Tool",
      "categorySlug": "tools",
      "term": "horror",
      "sourceSearch": "tag-horror",
      "fetchedUrl": "https://itch.io/tools/newest/tag-horror.xml"
    }
  ]
}
```

## `POST /api/admin/refresh`

Runs one ingest step, the same thing the cron does. With no `category`, `tag`, or `maxSearches` set, it processes the search at the saved cursor and advances it. With any of them set, it's a scoped run: it builds that search list, processes its first entry, and leaves the cursor alone.

Options:
- `dryRun`: fetch and parse, but write no items. An unscoped dry run still advances the cursor.
- `includeDebug`: add `search_debug`. Defaults to `true`.
- `previewItemsPerSearch`: preview items per search in the debug output, `0`-`20`. Default `3`.
- `category`, `tag`, `maxSearches`: scope the run, as in `/api/admin/searches`.

```json
{
  "started_at": "...",
  "dry_run": false,
  "processed_search": {
    "category": "Tool",
    "category_slug": "tools",
    "term": "ttrpg+horror",
    "source_search": "tag-ttrpg/tag-horror",
    "fetched_url": "https://itch.io/tools/newest/tag-ttrpg/tag-horror.xml"
  },
  "http_status": 200,
  "response_bytes": 48211,
  "final_url": "https://itch.io/tools/newest/tag-ttrpg/tag-horror.xml",
  "items_seen": 12,
  "skipped_banned": 0,
  "inserted": 2,
  "updated": 9,
  "failures": [],
  "scoped_run": false,
  "selected_categories": ["game-assets", "physical-games", "tools", "misc", "game-mods"],
  "selected_terms": [],
  "total_searches": 210,
  "processed_index": 14,
  "next_index": 15,
  "finished_at": "..."
}
```

- `http_status`, `response_bytes`, and `final_url` are only set when the fetch returned 2xx.
- Ingest only merges into the `source` of an existing row, so a hidden row stays hidden.
- Banned URLs and authors (see `/api/admin/ban`) are counted in `skipped_banned` and never written.

`failures` entries take one of these shapes:

```json
[
  { "fetched_url": "...", "status": 403, "content_type": "text/html", "snippet": "first 200 chars of body" },
  { "fetched_url": "...", "status": 200, "error": "Non-XML response", "content_type": "text/html", "snippet": "..." },
  { "fetched_url": "...", "error": "fetch failed" }
]
```

A 200 response that isn't RSS or Atom, such as a bot challenge page, is recorded as `Non-XML response` instead of being parsed as zero items.

## `GET /api/admin/refresh-debug` and `POST /api/admin/refresh-debug`

Runs a multi-search ingest for testing. Unlike `/api/admin/refresh`, it doesn't use the cursor.

- It samples 5 random tags, ignoring any `tag` input. The sample is returned as `sampled_tags`.
- `includeDebug` is always on, so `search_debug` lists `item_count` and `preview_items` per search.
- `GET` defaults to `dryRun=true`. `POST` writes unless the JSON body sets `"dryRun": true`.
- `maxSearches` defaults to the `MAX_SEARCHES_PER_RUN` var.
- The summary has `searches_attempted`, `searches_succeeded`, and `searches_failed` instead of the cursor fields.

## `POST /api/admin/ban`

Bans a URL or an author from ingest, then deletes any matching items. Requires the `x-admin-token` header to match the `ADMIN_TOKEN` secret. If `ADMIN_TOKEN` isn't set, the check is skipped.

JSON body: `{ "kind": "url" | "author", "value": "...", "reason": "...", "createdBy": "..." }`. Values are matched trimmed and lowercased. Banning the same `kind` and `value` again overwrites `reason` and `createdBy`.

```json
{ "ok": true, "kind": "author", "value": "...", "removed_count": 3 }
```

It returns `401` for a bad token, and `400` for a bad `kind` or a missing `value`.

## Cron

`* * * * *` runs one ingest step (`runIngestionStep`) with default options, so it visits each search in turn. Each run logs one JSON line: `event: "ingest_step"` with the index, URL, status, bytes, counts, and failures. It's logged at `warn` level when there are failures. A thrown error logs `event: "ingest_step_error"`.

The cursor is stored in the `ingest_state` table under `key = "search_cursor"`. A full cycle takes `total_searches` minutes.

Vars, in `[vars]` in `wrangler.toml`: `MAX_SEARCHES_PER_RUN` is the default `maxSearches` for `refresh-debug`. Secret: `ADMIN_TOKEN`.

# Detail worker

## `GET /api/detail/health`

```json
{ "ok": true, "service": "detail-worker" }
```

## `POST /api/detail/step`

Runs 5 detail checks, the same thing the cron does. Each check scrapes the most overdue item page and applies the rules in `worker/detail/shared.js`:
- An item that fails a rule is hidden (`removed_reason` and `removed_at` are set).
- A hidden item that now passes is restored.
- An item whose page returns 404 is deleted.

Options:
- `dryRun`: scrape, but write nothing.
- `staleDays`: days before a checked item is due again. Default `DETAIL_STALE_DAYS`.
- `requestTimeoutMs`: per-page fetch timeout, min `1000`. Default `DETAIL_REQUEST_TIMEOUT_MS`.

```json
{
  "fetches_per_request": 5,
  "aggregate": {
    "attempted_steps": 5,
    "updated": 3,
    "restored": 0,
    "removed_excluded_tag": 0,
    "removed_ai_assisted": 1,
    "removed_low_rating": 0,
    "removed_404": 0,
    "failed": 1,
    "empty": 0
  },
  "runs": [
    {
      "started_at": "...",
      "dry_run": false,
      "due": 120,
      "stale_days": 3,
      "processed_url": "https://...",
      "action": "removed_ai_assisted",
      "rating": null,
      "engagement": 0,
      "ai": "ai assisted",
      "language": null,
      "excluded_tag": null,
      "removed_reason": "ai_assisted",
      "error": null,
      "finished_at": "..."
    }
  ]
}
```

- `action` is one of `DETAIL_ACTIONS` in `shared.js`, or `none` when nothing is due. `empty` counts the `none` steps.
- A `failed` check, such as a timeout or a non-404 HTTP error, still sets `detail_checked_at`. The page then waits `staleDays` instead of blocking the queue.

## Cron

`* * * * *` runs the same 5 checks with `dryRun: false`.

Vars, all in `[vars]` in `worker/detail/wrangler.toml`, because a deploy replaces vars set in the dashboard:
- `DETAIL_STALE_DAYS`
- `DETAIL_REQUEST_TIMEOUT_MS`
- `DETAIL_USER_AGENT`

# Email worker

## `POST /?email=...&secret=...`

Sends the newsletter to one subscriber now. `secret` must match the `EMAIL_WORKER_SECRET` secret, otherwise it returns `401`. `email` can also be passed in a JSON body.

```json
{ "ok": true, "email": "...", "items_count": 12 }
```

It returns `404` when there's no subscription, and `500` with `{ "ok": false, "error": "..." }` when the send fails.

## `GET /?email=...`

Unsubscribes the email and returns an HTML confirmation page. This is the link in each newsletter's footer.

## Cron

`0 12 1 * *` sends each subscriber their newsletter on the 1st of the month. Mail goes out through the external mail worker at `email.codabool.workers.dev`, using `EMAIL_WORKER_SECRET`. Hidden items are left out.

## ENNIE badge

When `src/awards.js` has an `ENNIE` entry for the current UTC year, every newsletter shows the ENNIE logo to the right of its title, with the subtitle "ENNIES {year}", linking to that entry's `url`. The Jams page reads the same list. Nothing is fetched: add the year's entry by hand once the winners are posted, and the badge shows until the year changes. `findEnnieAward` in `worker/src/newsletter.js` does the lookup, so the preview and the monthly send always match.

The logo is `public/ennie.webp`, linked from the frontend at `https://discover.codabool.workers.dev/ennie.webp` (`ENNIE_LOGO_URL`). The frontend deploys from git, so a new logo goes live once it's committed and pushed.
