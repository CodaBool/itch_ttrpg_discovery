# Collect data locally
> local.mjs uses a local browser to fetch and collect tag results. This is written for Linux chrome flatpak

1. start chrome with a persistent profile directory (keeps your itch login cookie across runs):
	`flatpak run com.google.Chrome --remote-debugging-port=9222 --user-data-dir=$HOME/.config/itch-rpg-feed/chrome-cdp`
	a. Windows: `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDebug"`
2. login to itch in the browser
3. run script `npm run local`

## Detail scrape notes

`detail.mjs` does not use the CDP browser above. It launches its own Puppeteer Chrome (headless by default) per batch, so no itch login is needed.

- Run: `npm run detail`. This writes to the **production** D1. It updates rows, hides rows that fail a rule, and deletes rows whose page returns 404.
- Safe check: `DETAIL_DRY_RUN=true DETAIL_MAX_ITEMS=10 DETAIL_PARALLEL_WORKERS=1 npm run detail`. It reads D1 and scrapes, but writes nothing.
- Each page goes through `applyDetailResult` in `worker/detail/shared.js`, the same code the detail worker uses. A row that fails a rule (`REMOVAL_REASONS`: excluded tag, AI-assisted, low rating) is hidden, not deleted: it gets `removed_reason` and `removed_at` (migration `0008`), so ingest can't re-add it. The script rechecks hidden rows too, and a row that now passes is restored. 404 pages are deleted after all batches finish.
- The summary prints one count per action in `DETAIL_ACTIONS` (`updated`, `restored`, `removed_<reason>`, `removed_404`, `failed`). A 404 is counted under both `failed` and `removed_404`.
- Updated rows get `detail_checked_at` set (migration `0007`), so the detail worker cron treats them as fresh and won't re-check them for `DETAIL_STALE_DAYS`.

Required env vars: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`.

Optional env vars:

| Var | Default | |
|---|---|---|
| `DETAIL_DRY_RUN` | `false` | Scrape and log, but skip all D1 writes |
| `DETAIL_MAX_ITEMS` | `1000000` | Rows to load, ordered by `first_seen_at` |
| `DETAIL_START_OFFSET` | `0` | Rows to skip first |
| `DETAIL_BATCH_SIZE` | `100` | URLs per browser launch |
| `DETAIL_PARALLEL_WORKERS` | `5` | Browsers running at once |
| `DETAIL_COOLDOWN_MS` | `500` | Pause between URLs per worker |
| `DETAIL_PRELOAD_QUERY_BATCH_SIZE` | `1000` | Page size when loading URLs from D1 |
| `DETAIL_HEADLESS` | `true` | Set `false` to watch the browser |
| `DETAIL_PROTOCOL_TIMEOUT_MS` | `120000` | Puppeteer CDP timeout |
| `DETAIL_REQUEST_TIMEOUT_MS` | `30000` | Page navigation timeout |
| `LOCAL_CHROME_EXECUTABLE` | Puppeteer's Chrome | Chrome binary to launch |
| `LOCAL_USER_AGENT` | Chrome 149 UA | User agent for item pages |
