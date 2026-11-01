export function toInt(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
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

function decodeCodePoint(match, code) {
  // fromCodePoint throws past U+10FFFF, which would fail the whole page parse.
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

function decodeHtmlEntities(value) {
  // &amp; goes last so "&amp;lt;" decodes once to "&lt;", not twice to "<".
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (match, code) => decodeCodePoint(match, Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => decodeCodePoint(match, parseInt(code, 16)))
    .replace(/&amp;/g, "&");
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

  const sourceTags = [...raw.matchAll(/href=["'][^"']*\/tag-([^/?#"']+)/gi)]
    .map((match) => String(match[1] || "").trim().toLowerCase())
    .filter(Boolean);

  return {
    ratingTooltip,
    topicCount,
    commentCount,
    ai: hasAiAssisted ? "ai assisted" : hasNoAi ? "no ai" : null,
    sourceTags,
    languageText: extractLanguageText(raw),
  };
}

// Mirrors the title + meta description + description text that scripts/detail.mjs reads from the DOM.
function extractLanguageText(raw) {
  const title =
    raw.match(/<h1\b[^>]*class=["'][^"']*\bgame_title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";
  const metaTag = raw.match(/<meta\b[^>]*name=["']description["'][^>]*>/i)?.[0] || "";
  const metaDescription = metaTag.match(/content=(['"])([\s\S]*?)\1/i)?.[2] || "";

  return stripHtml(`${title} ${decodeHtmlEntities(metaDescription)} ${extractDivContent(raw, "formatted_description")}`)
    .trim()
    .slice(0, 8000);
}

// Returns the inner HTML of the first div with the class, walking nested divs to find its closing tag.
function extractDivContent(raw, className) {
  const open = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, "i").exec(raw);
  if (!open) return "";

  const start = open.index + open[0].length;
  const divTag = /<(\/?)div\b[^>]*>/gi;
  divTag.lastIndex = start;

  let depth = 1;
  let match;
  while ((match = divTag.exec(raw))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      return raw.slice(start, match.index).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
    }
  }
  return "";
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " "),
  );
}

export const DETAIL_EXCLUDED_TAGS = new Set([
  "vtt-battlemaps",
  "foundry-vtt",
  "solo-rpg",
  "solo-rpgs",
  "solo",
  "solo-game",
  "solo-games",
  "solo-ttrpg",
  "singleplayer",
  "single-player",
  "singleplayer-rpg",
  "singleplayer-ttrpg",
  "single-player-ttrpg",
  "journaling",
  "journaling-rpg",
  "dnd5e",
  "dungeons-and-dragsons",
  "larp",
  "pathfinder",
  "diceless",
  "gm-less",
  "lancer",
]);

export function findExcludedTag(sourceTags) {
  if (!Array.isArray(sourceTags)) return null;
  return sourceTags.find((tag) => DETAIL_EXCLUDED_TAGS.has(String(tag || "").trim().toLowerCase())) || null;
}

export function hasStrongRatingAndEngagement(rating, engagement) {
  const value = String(rating || "").trim();
  if (!value.includes("over")) return false;

  const parts = value.split("over");
  if (parts.length !== 2) return false;

  const average = Number(parts[0]);
  const count = Number(parts[1]);
  const positiveCount = Number.isFinite(average) && average >= 4 && Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;

  const engagementCount = Number.isFinite(Number(engagement))
    ? Math.max(0, Math.floor(Number(engagement)))
    : 0;

  return positiveCount >= 3 && engagementCount >= 1;
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

// The rules an item can fail, in the order they are checked. Each one is stored as items.removed_reason.
export const REMOVAL_REASONS = ["excluded_tag", "ai_assisted", "low_rating"];

// Every action a detail check can report, so callers can count them without listing each one.
export const DETAIL_ACTIONS = [
  "updated",
  "restored",
  ...REMOVAL_REASONS.map((reason) => `removed_${reason}`),
  "removed_404",
  "failed",
];

function findRemovalReason(metrics, excludedTag) {
  if (excludedTag && !hasStrongRatingAndEngagement(metrics.rating, metrics.engagement)) return "excluded_tag";
  if (String(metrics.ai || "").trim().toLowerCase() === "ai assisted") return "ai_assisted";
  if (shouldRemoveForLowRating(metrics.rating)) return "low_rating";
  return null;
}

// Applies the rules to one scraped page and saves the result. A failing item is hidden rather than
// deleted, so ingest can't re-add it, and a hidden item that passes a later check is shown again.
// removed_at keeps the first hide time. previousReason is the row's removed_reason before this check.
export async function applyDetailResult(db, url, scraped, { detectLanguage, previousReason = null, dryRun = false }) {
  const metrics = deriveDetailMetrics(scraped);
  const excludedTag = findExcludedTag(scraped?.sourceTags);
  const removedReason = findRemovalReason(metrics, excludedTag);
  const language = await detectLanguage(scraped?.languageText);

  if (!dryRun) {
    await db.execute(
      `UPDATE items
       SET rating = ?,
           engagement = ?,
           ai = ?,
           language = ?,
           removed_reason = ?,
           removed_at = CASE WHEN ? IS NULL THEN NULL ELSE coalesce(removed_at, CURRENT_TIMESTAMP) END,
           detail_checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE url = ?`,
      [metrics.rating, metrics.engagement, metrics.ai, language, removedReason, removedReason, url]
    );
  }

  let action = previousReason ? "restored" : "updated";
  if (removedReason) action = `removed_${removedReason}`;

  return { ...metrics, language, excludedTag, removedReason, action };
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

// Picks the item whose detail scrape is most overdue: never-checked items first (newest first),
// then the oldest check that is at least staleDays old. Returns row = null when nothing is due.
export async function selectNextDetailTarget(db, options = {}) {
  const staleDays = Math.max(1, toInt(options.staleDays, 7));
  const staleModifier = `-${staleDays} days`;
  const skipUrls = Array.isArray(options.skipUrls) ? options.skipUrls.filter(Boolean) : [];
  const skipClause = skipUrls.length > 0 ? `AND url NOT IN (${skipUrls.map(() => "?").join(", ")})` : "";

  const dueWhere = `trim(coalesce(url, '')) <> ''
       AND (detail_checked_at IS NULL OR datetime(detail_checked_at) <= datetime('now', ?))`;

  const dueRows = await db.select(`SELECT COUNT(*) AS count FROM items WHERE ${dueWhere}`, [staleModifier]);
  const rows = await db.select(
    `SELECT url, detail_checked_at, first_seen_at, removed_reason
     FROM items
     WHERE ${dueWhere}
       ${skipClause}
     ORDER BY
       CASE WHEN detail_checked_at IS NULL THEN 0 ELSE 1 END ASC,
       CASE WHEN detail_checked_at IS NULL THEN datetime(first_seen_at) END DESC,
       datetime(detail_checked_at) ASC,
       url ASC
     LIMIT 1`,
    [staleModifier, ...skipUrls]
  );

  return {
    due: Number(dueRows?.[0]?.count || 0),
    row: rows?.[0] || null,
    staleDays,
  };
}

export async function runSingleDetailStep(options) {
  const {
    db,
    fetchDetail,
    detectLanguage = async () => null,
    staleDays = 7,
    skipUrls = [],
    dryRun = false,
  } = options || {};

  if (!db || typeof db.select !== "function" || typeof db.execute !== "function") {
    throw new Error("runSingleDetailStep requires a db adapter with select() and execute() methods");
  }

  if (typeof fetchDetail !== "function") {
    throw new Error("runSingleDetailStep requires fetchDetail(url)");
  }

  const startedAt = new Date().toISOString();
  const plan = await selectNextDetailTarget(db, { staleDays, skipUrls });

  const summary = {
    started_at: startedAt,
    dry_run: Boolean(dryRun),
    due: plan.due,
    stale_days: plan.staleDays,
    processed_url: null,
    action: "none",
    rating: null,
    engagement: null,
    ai: null,
    language: null,
    excluded_tag: null,
    removed_reason: null,
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
    const result = await applyDetailResult(db, url, scraped, {
      detectLanguage,
      previousReason: plan.row.removed_reason,
      dryRun,
    });

    summary.action = result.action;
    summary.rating = result.rating;
    summary.engagement = result.engagement;
    summary.ai = result.ai;
    summary.language = result.language;
    summary.excluded_tag = result.excludedTag;
    summary.removed_reason = result.removedReason;
  } catch (error) {
    const status = Number(error?.status);
    const is404 = status === 404 || /HTTP\s*404/i.test(String(error?.message || ""));

    if (is404) {
      // A deleted page drops out of itch search too, so ingest won't re-add it.
      if (!dryRun) {
        await db.execute("DELETE FROM items WHERE url = ?", [url]);
      }
      summary.action = "removed_404";
    } else {
      summary.action = "failed";
      summary.error = error instanceof Error ? error.message : String(error || "unknown error");

      // Mark it checked anyway so a page that keeps failing waits staleDays instead of blocking the queue.
      if (!dryRun) {
        await db.execute("UPDATE items SET detail_checked_at = CURRENT_TIMESTAMP WHERE url = ?", [url]);
      }
    }
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}
