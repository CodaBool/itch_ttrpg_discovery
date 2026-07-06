export function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function countMatches(input, regex) {
  const matches = String(input || "").match(regex);
  return Array.isArray(matches) ? matches.length : 0;
}

export function parseRatingFromTooltip(tooltip) {
  if (!tooltip || typeof tooltip !== "string") return null;

  const match = tooltip
    .trim()
    .match(/([0-9]+(?:\.[0-9]+)?)\s+average rating from\s+([0-9]+)\s+total ratings?/i);

  if (!match) return null;

  const average = match[1];
  const totalRatings = match[2];
  return `${average}over${totalRatings}`;
}

export function shouldRemoveForLowRating(rawRating) {
  const value = String(rawRating || "").trim();
  if (!value) return false;

  const parts = value.split("over");
  if (parts.length !== 2) return false;

  const average = Number(parts[0]);
  const totalRatings = Number(parts[1]);
  if (!Number.isFinite(average) || !Number.isFinite(totalRatings)) return false;

  return average === 1 && totalRatings >= 2;
}

export function parseDetailFromHtml(html) {
  const raw = String(html || "");

  const ratingTag = raw.match(/<[^>]*class=["'][^"']*\baggregate_rating\b[^"']*["'][^>]*>/i)?.[0] || "";
  const tooltipRaw = ratingTag.match(/data-tooltip=(['"])(.*?)\1/i)?.[2] || null;
  const ratingTooltip = tooltipRaw ? decodeHtmlEntities(tooltipRaw) : null;

  const topicCount = countMatches(raw, /class=["'][^"']*\bcommunity_topic\b[^"']*["']/gi);
  const commentCount = countMatches(raw, /class=["'][^"']*\bcommunity_post\b[^"']*["']/gi);

  const hasNoAi = /href=["'][^"']*tag-no-ai[^"']*["']/i.test(raw);
  const hasAiAssisted = /href=["'][^"']*ai-assisted[^"']*["']/i.test(raw);

  return {
    ratingTooltip,
    topicCount,
    commentCount,
    ai: hasAiAssisted ? "ai assisted" : hasNoAi ? "no ai" : null,
  };
}

export function deriveDetailMetrics(scraped) {
  const rating = parseRatingFromTooltip(scraped?.ratingTooltip);
  const engagement = Number(scraped?.topicCount || 0) + Number(scraped?.commentCount || 0);
  const ai = scraped?.ai || null;

  return {
    rating,
    engagement: Number.isFinite(engagement) ? engagement : 0,
    ai,
  };
}

export class CloudflareD1Client {
  constructor({ accountId, databaseId, apiToken }) {
    this.accountId = accountId;
    this.databaseId = databaseId;
    this.apiToken = apiToken;
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  async query(sql, params = []) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const statusText = payload?.errors?.[0]?.message || response.statusText || "request failed";
      const err = new Error(`D1 HTTP ${response.status}: ${statusText}`);
      err.status = response.status;
      throw err;
    }

    if (!payload?.success) {
      const statusText = payload?.errors?.[0]?.message || "Cloudflare API returned success=false";
      const err = new Error(`D1 API error: ${statusText}`);
      err.status = response.status;
      throw err;
    }

    const statement = Array.isArray(payload.result) ? payload.result[0] : payload.result;
    return statement?.results || [];
  }

  async select(sql, params = []) {
    return this.query(sql, params);
  }

  async execute(sql, params = []) {
    await this.query(sql, params);
  }
}

export class WorkerD1Client {
  constructor(db) {
    this.db = db;
  }

  async select(sql, params = []) {
    const result = await this.db.prepare(sql).bind(...params).all();
    return result?.results || [];
  }

  async execute(sql, params = []) {
    await this.db.prepare(sql).bind(...params).run();
  }
}

async function readCursorState(db, key) {
  const rows = await db.select("SELECT value FROM ingest_state WHERE key = ?", [key]);
  const value = Number(rows?.[0]?.value || "0");
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

async function writeCursorState(db, key, value) {
  await db.execute(
    `INSERT INTO ingest_state (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`,
    [key, String(value)]
  );
}

export async function selectNextDetailTarget(db, options = {}) {
  const cursorKey = String(options.cursorKey || "detail_cursor").trim() || "detail_cursor";
  const staleDays = Math.max(1, toInt(options.staleDays, 7));
  const staleModifier = `-${staleDays} days`;

  const totalRows = await db.select(
    "SELECT COUNT(*) AS count FROM items WHERE trim(coalesce(url, '')) <> ''"
  );
  const total = Number(totalRows?.[0]?.count || 0);

  if (!Number.isFinite(total) || total <= 0) {
    return {
      cursorKey,
      total: 0,
      currentCursor: 0,
      nextCursor: 0,
      row: null,
      staleDays,
    };
  }

  const currentCursor = (await readCursorState(db, cursorKey)) % total;
  const rows = await db.select(
    `SELECT url, updated_at, first_seen_at
     FROM items
     WHERE trim(coalesce(url, '')) <> ''
     ORDER BY
       CASE
         WHEN datetime(updated_at) <= datetime('now', ?) THEN 1
         ELSE 0
       END ASC,
       datetime(updated_at) ASC,
       datetime(first_seen_at) ASC,
       url ASC
     LIMIT 1 OFFSET ?`,
    [staleModifier, currentCursor]
  );

  const row = rows?.[0] || null;
  const nextCursor = (currentCursor + 1) % total;

  return {
    cursorKey,
    total,
    currentCursor,
    nextCursor,
    row,
    staleDays,
  };
}

export async function runSingleDetailStep(options) {
  const {
    db,
    fetchDetail,
    cursorKey = "detail_cursor",
    staleDays = 7,
    dryRun = false,
  } = options || {};

  if (!db || typeof db.select !== "function" || typeof db.execute !== "function") {
    throw new Error("runSingleDetailStep requires a db adapter with select() and execute() methods");
  }

  if (typeof fetchDetail !== "function") {
    throw new Error("runSingleDetailStep requires fetchDetail(url)");
  }

  const startedAt = new Date().toISOString();
  const plan = await selectNextDetailTarget(db, { cursorKey, staleDays });

  const summary = {
    started_at: startedAt,
    dry_run: Boolean(dryRun),
    cursor_key: plan.cursorKey,
    total_candidates: plan.total,
    cursor: plan.currentCursor,
    next_cursor: plan.nextCursor,
    stale_days: plan.staleDays,
    processed_url: null,
    action: "none",
    rating: null,
    engagement: null,
    ai: null,
    removed_404: false,
    removed_low_rating: false,
    error: null,
    finished_at: null,
  };

  if (!plan.row?.url) {
    summary.finished_at = new Date().toISOString();
    return summary;
  }

  const url = String(plan.row.url || "").trim();
  summary.processed_url = url;

  try {
    const scraped = await fetchDetail(url);
    const metrics = deriveDetailMetrics(scraped);

    summary.rating = metrics.rating;
    summary.engagement = metrics.engagement;
    summary.ai = metrics.ai;

    if (shouldRemoveForLowRating(metrics.rating)) {
      if (!dryRun) {
        await db.execute("DELETE FROM items WHERE url = ?", [url]);
      }
      summary.action = "removed_low_rating";
      summary.removed_low_rating = true;
    } else {
      if (!dryRun) {
        await db.execute(
          `UPDATE items
           SET rating = ?,
               engagement = ?,
               ai = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE url = ?`,
          [metrics.rating, metrics.engagement, metrics.ai, url]
        );
      }
      summary.action = "updated";
    }
  } catch (error) {
    const status = Number(error?.status);
    const is404 = status === 404 || /HTTP\s*404/i.test(String(error?.message || ""));

    if (is404) {
      if (!dryRun) {
        await db.execute("DELETE FROM items WHERE url = ?", [url]);
      }
      summary.action = "removed_404";
      summary.removed_404 = true;
    } else {
      summary.action = "failed";
      summary.error = error instanceof Error ? error.message : String(error || "unknown error");
    }
  } finally {
    await writeCursorState(db, plan.cursorKey, plan.nextCursor);
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}
