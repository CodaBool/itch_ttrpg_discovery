# Worker API Routes

This document explains every route currently implemented in `worker/src/index.js`.

Base URL examples:
- Local dev: `http://127.0.0.1:8787`
- Production: your deployed worker URL

## Common Behavior

- All API responses are JSON.
- CORS headers are enabled for `GET`, `POST`, and `OPTIONS`.
- `OPTIONS` requests return `{ "ok": true }` for preflight support.

## Route: `GET /api/items`

Lists items currently stored in D1, with optional filtering.

### Query Parameters

- `q` (optional): text search against `title` and `description`.
- `category` (optional): category filter. Matches either source `category` or `category_slug`.
- `tag` (optional): tag filter against source `term`.
- `limit` (optional): number of rows fetched before in-memory filtering.
  - Default: `100`
  - Min: `1`
  - Max: `500`

### Response Shape

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
      "first_seen_at": "...",
      "updated_at": "..."
    }
  ],
  "filters": {
    "category": "",
    "tag": "",
    "q": "",
    "limit": 100
  }
}
```

## Route: `GET /api/metadata`

Returns static discovery metadata used by the worker.

### Response Shape

```json
{
  "categories": [
    { "name": "Assets", "slug": "game-assets" },
    { "name": "Physical Game", "slug": "physical-games" },
    { "name": "Tool", "slug": "tools" },
    { "name": "Other", "slug": "misc" },
    { "name": "Game mod", "slug": "game-mods" }
  ],
  "tags": ["horror", "body-horror", "..."]
}
```

## Route: `GET /api/admin/searches`

Debug helper that shows which XML feed URLs would be requested for the current selection.
It does not fetch or write items.

### Query Parameters

- `category` (optional): comma-separated categories by slug or name.
  - Example: `category=tools,game-assets`
- `tag` (optional): comma-separated tags.
  - Example: `tag=horror,micro-rpg`
- `maxSearches` (optional): hard cap on generated search list.

### Response Shape

```json
{
  "count": 10,
  "selected_categories": ["tools"],
  "selected_terms": ["horror", "micro-rpg"],
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

## Route: `POST /api/admin/refresh`

Manual ingestion endpoint (non-debug). Processes exactly one queued search URL per call and advances a persisted cursor in D1.

This is the same model used by cron.

### Inputs

You can send options via query params or JSON body (`application/json`).

Supported options:
- `dryRun`: if true, fetches/parses but does not write to D1.
- `includeDebug`: include per-search debug details.
- `previewItemsPerSearch`: number of preview items per search in debug output (0-20).

### Example Body

```json
{
  "dryRun": false,
  "includeDebug": false,
  "previewItemsPerSearch": 3
}
```

### Response Shape

```json
{
  "started_at": "...",
  "dry_run": false,
  "processed_search": {
    "category": "Tool",
    "category_slug": "tools",
    "term": "ttrpg+horror",
    "tags": ["ttrpg", "horror"],
    "source_search": "tag-ttrpg/tag-horror",
    "fetched_url": "https://itch.io/tools/newest/tag-ttrpg/tag-horror.xml"
  },
  "items_seen": 12,
  "inserted": 2,
  "updated": 9,
  "total_searches": 78,
  "processed_index": 14,
  "next_index": 15,
  "failures": [
    { "fetched_url": "...", "status": 403 }
  ],
  "finished_at": "..."
}
```

## Route: `GET /api/admin/refresh-debug`

Runs ingestion in debug mode with special testing behavior.

Debug behavior currently applied:
- Randomly samples 5 tags per call.
- Uses sampled tags regardless of provided `tag` input.
- Defaults to `dryRun=true` when not explicitly provided.
- Forces `includeDebug=true`.

This route is intended for test runs to inspect fetched results while reducing request volume.

### Query Parameters

Same options as `/api/admin/refresh` are accepted, but debug sampling rules above still apply.

### Extra Debug Fields in Response

- `sampled_tags`: the 5 tags selected for this run.
- `search_debug`: per-search details including `item_count` and `preview_items`.

## Route: `POST /api/admin/refresh-debug`

Same as `GET /api/admin/refresh-debug`, but accepts JSON body in addition to query params.

Useful when you want to pass many options in a structured payload.

## Fallback Route

Any unknown path returns:

```json
{ "error": "Not found" }
```

with HTTP `404`.

## Scheduled Trigger (Cron)

This is not an HTTP route, but it is a key execution path.

- Implemented in the worker `scheduled()` handler.
- Triggered by cron config in `wrangler.toml`.
- Runs one queued ingestion step (`runIngestionStep(env)`) with default settings.

Current cron in `wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *"]
```

That means one search request is attempted every minute. With 78 total searches configured, a full cycle is approximately 78 minutes.

## Ingestion Cursor State

The one-step scheduler persists its queue position in D1 table `ingest_state`:

- `key = "search_cursor"`
- `value = next search index`

This allows refresh/cron runs to continue where the previous run left off.
