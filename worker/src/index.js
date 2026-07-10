import { XMLParser } from "fast-xml-parser";
import { franc } from "franc";
import { prepareNewsletterPreview } from "./newsletter.js";

// Keep in sync with worker/src/index.js
const PAIR_TAGS = [
  "horror",
  "body-horror",
  "generator",
  "tool",
  "mystery",
  "investigation",
  "comedy",
  "survival-horror",
  "pbta",
  "forged-in-the-dark",
  "sci-fi",
  "tabletop",
  "one-page",
  "zine",
  "fanzine",
  "supplement",
  "cyborg",
];

const SOLO_TAGS = [
  "one-shot",
  "rules-lite",
  "rules-light",
  "micro-rpg",
  "ttrpg",
  "osr",
  "liminal-horror",
  "mothership",
  "mothership-rpg",
  "panic-engine",
  "mork-borg",
  "delta-green",
  "call-of-cthulhu",
  "triangle-agency",
  "mausritter",
  "cairn",
  "into-the-odd",
  "fist",
  "pirate-borg",
  "brindlewood",
  "carved-from-brindlewood",
  "electric-bastionland",
  "cain",
  "trophy-dark",
  "public-access",
];

const CATEGORIES = [
  { name: "Assets", slug: "game-assets" },
  { name: "Physical Game", slug: "physical-games" },
  { name: "Tool", slug: "tools" },
  { name: "Other", slug: "misc" },
  { name: "Game mod", slug: "game-mods" },
];

const SEARCH_DEFINITIONS = [
  ...PAIR_TAGS.map((tag) => ({
    type: "pair",
    tags: ["ttrpg", tag],
    term: `ttrpg+${tag}`,
  })),
  ...SOLO_TAGS.map((tag) => ({
    type: "solo",
    tags: [tag],
    term: tag,
  })),
];

const SEARCH_TERMS = [
  ...new Set(SEARCH_DEFINITIONS.flatMap((definition) => definition.tags)),
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function toBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function toBoundedInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-admin-token");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    if (typeof value["#text"] === "string") return value["#text"].trim();
    if (typeof value.__cdata === "string") return value.__cdata.trim();
  }
  return "";
}

function stripHtmlAndNormalizeWhitespace(input) {
  if (!input) return "";

  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAuthorFromGuid(guid) {
  const guidStr = textValue(guid);
  if (!guidStr.includes("https://") || !guidStr.includes(".itch.io/")) return "";

  try {
    return guidStr.split("https://")[1].split(".itch.io/")[0].replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parseAuthorUrlFromFetchedUrl(guid) {
  const guidStr = parseAuthorFromGuid(guid)
  return guidStr ? `https://${guidStr}.itch.io` : "";
}

function toLanguageText(item) {
  const title = textValue(item.plainTitle) || textValue(item.title);
  const description = stripHtmlAndNormalizeWhitespace(textValue(item.description));
  return `${title} ${description}`.trim();
}

function detectItemLanguage(item) {
  const raw = toLanguageText(item);
  if (!raw) return null;

  const detectedIso3 = franc(raw, { minLength: 20 });
  if (!detectedIso3 || detectedIso3 === "und" || detectedIso3 === "eng") {
    return null;
  }

  return detectedIso3;
}

function normalizeSource(source) {
  return {
    category: source.category,
    category_slug: source.categorySlug,
    term: source.term,
    tags: Array.isArray(source.tags) ? source.tags : [],
    source_search: source.sourceSearch,
    fetched_url: source.fetchedUrl,
  };
}

function mergeSource(existingRaw, incomingSource) {
  let parsed = [];

  try {
    const maybe = JSON.parse(existingRaw || "[]");
    if (Array.isArray(maybe)) parsed = maybe;
  } catch {
    parsed = [];
  }

  const normalizedIncoming = normalizeSource(incomingSource);
  const key = `${normalizedIncoming.category_slug}|${normalizedIncoming.term}|${normalizedIncoming.source_search}`;

  const dedup = new Map();
  for (const source of parsed) {
    const sourceKey = `${source.category_slug}|${source.term}|${source.source_search}`;
    dedup.set(sourceKey, source);
  }
  dedup.set(key, normalizedIncoming);

  return JSON.stringify(Array.from(dedup.values()));
}

function normalizeItem(item, fetchedUrl) {
  const link = textValue(item.link);
  const title = textValue(item.plainTitle) || textValue(item.title);

  if (!link || !title) return null;

  return {
    url: link,
    title,
    description: stripHtmlAndNormalizeWhitespace(textValue(item.description)),
    language: detectItemLanguage(item),
    image_url: textValue(item.imageurl),
    price: textValue(item.price),
    publish_date: textValue(item.pubDate),
    update_date: textValue(item.updateDate),
    author: parseAuthorFromGuid(item.guid),
    author_url: parseAuthorUrlFromFetchedUrl(item.guid),
  };
}

function parseXmlItems(xml, fetchedUrl) {
  const parsed = xmlParser.parse(xml);
  const root = parsed?.rss?.channel || parsed?.feed || {};
  const rawItems = root.item || root.entry || [];
  const itemList = Array.isArray(rawItems) ? rawItems : [rawItems];

  const normalized = [];
  for (const entry of itemList) {
    const row = normalizeItem(entry, fetchedUrl);
    if (row) normalized.push(row);
  }

  return normalized;
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function sampleRandom(values, count) {
  const pool = [...values];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)));
}

function applyDebugSamplingOptions(options) {
  const sampledTags = sampleRandom(SEARCH_TERMS, 5);
  return {
    ...options,
    tag: sampledTags.join(","),
    maxSearches: options.maxSearches ?? 25,
    sampled_tags: sampledTags,
  };
}

function normalizeCategoryInput(categoryRaw) {
  const wanted = new Set(parseList(categoryRaw).map((v) => v.toLowerCase()));
  if (!wanted.size) return CATEGORIES;

  return CATEGORIES.filter((c) => wanted.has(c.slug.toLowerCase()) || wanted.has(c.name.toLowerCase()));
}

function normalizeTagInput(tagRaw) {
  const wanted = new Set(parseList(tagRaw).map((v) => v.toLowerCase()));
  if (!wanted.size) return [];

  return SEARCH_TERMS.filter((term) => wanted.has(term.toLowerCase()));
}

function buildSearches(options = {}) {
  const maxSearches = options.maxSearches ?? Number.POSITIVE_INFINITY;
  const selectedCategories = options.categories ?? CATEGORIES;
  const selectedTags = options.tags ?? [];
  const selectedTagSet = new Set(selectedTags.map((tag) => tag.toLowerCase()));
  const searches = [];

  // Interleave categories per definition so the step cursor cycles categories quickly.
  for (const definition of SEARCH_DEFINITIONS) {
    for (const category of selectedCategories) {
      const shouldInclude =
        selectedTagSet.size === 0 ||
        definition.tags.some((tag) => selectedTagSet.has(tag.toLowerCase()));

      if (!shouldInclude) continue;

      const sourceSearch = definition.tags.map((tag) => `tag-${tag}`).join("/");
      searches.push({
        category: category.name,
        categorySlug: category.slug,
        term: definition.term,
        tags: definition.tags,
        sourceSearch,
        fetchedUrl: `https://itch.io/${category.slug}/newest/${definition.tags
          .map((tag) => `tag-${encodeURIComponent(tag)}`)
          .join("/")}.xml`,
      });
    }
  }

  return searches.slice(0, maxSearches);
}

function hasScopedStepOptions(options = {}) {
  const hasCategory = Boolean(String(options.category ?? "").trim());
  const hasTag = Boolean(String(options.tag ?? "").trim());
  const hasMaxSearches = options.maxSearches != null && String(options.maxSearches).trim() !== "";
  return hasCategory || hasTag || hasMaxSearches;
}

function itemPreview(item) {
  return {
    url: item.url,
    title: item.title,
    price: item.price,
    author: item.author,
    publish_date: item.publish_date,
  };
}

function normalizeBanValue(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadIngestionBans(env) {
  const rows = await env.DB.prepare("SELECT kind, value FROM ingest_bans").all();
  const bannedUrls = new Set();
  const bannedAuthors = new Set();

  for (const row of rows.results || []) {
    const kind = String(row.kind || "").trim().toLowerCase();
    const value = normalizeBanValue(row.value);
    if (!value) continue;

    if (kind === "url") bannedUrls.add(value);
    if (kind === "author") bannedAuthors.add(value);
  }

  return { bannedUrls, bannedAuthors };
}

function isItemBanned(item, bans) {
  const url = normalizeBanValue(item.url);
  const author = normalizeBanValue(item.author);
  if (url && bans.bannedUrls.has(url)) return true;
  if (author && bans.bannedAuthors.has(author)) return true;
  return false;
}

async function upsertItem(env, item, source) {
  const existing = await env.DB.prepare("SELECT source, first_seen_at FROM items WHERE url = ?")
    .bind(item.url)
    .first();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO items (
        url, source, title, description, image_url, price, publish_date, update_date,
        author, author_url, language, first_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
      .bind(
        item.url,
        JSON.stringify([normalizeSource(source)]),
        item.title,
        item.description,
        item.image_url,
        item.price,
        item.publish_date,
        item.update_date,
        item.author,
        item.author_url,
        item.language
      )
      .run();

    return { inserted: 1, updated: 0 };
  }

  const mergedSource = mergeSource(existing.source, source);
  await env.DB.prepare(
    `UPDATE items
     SET source = ?,
         title = ?,
         description = ?,
         image_url = ?,
         price = ?,
         publish_date = ?,
         update_date = ?,
         author = ?,
         author_url = ?,
         language = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE url = ?`
  )
    .bind(
      mergedSource,
      item.title,
      item.description,
      item.image_url,
      item.price,
      item.publish_date,
      item.update_date,
      item.author,
      item.author_url,
      item.language,
      item.url
    )
    .run();

  return { inserted: 0, updated: 1 };
}

async function readIngestionCursor(env) {
  const row = await env.DB.prepare("SELECT value FROM ingest_state WHERE key = ?")
    .bind("search_cursor")
    .first();

  const cursor = Number(row?.value || "0");
  if (!Number.isFinite(cursor) || cursor < 0) return 0;
  return Math.floor(cursor);
}

async function writeIngestionCursor(env, nextCursor) {
  await env.DB.prepare(
    `INSERT INTO ingest_state (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind("search_cursor", String(nextCursor))
    .run();
}

async function runSingleSearch(env, search, options = {}) {
  const dryRun = toBoolean(options.dryRun, false);
  const includeDebug = toBoolean(options.includeDebug, false);
  const previewItemsPerSearch = toBoundedInt(options.previewItemsPerSearch, 0, 20, 3);
  const bans = options.bans || await loadIngestionBans(env);

  const summary = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    processed_search: normalizeSource(search),
    items_seen: 0,
    skipped_banned: 0,
    inserted: 0,
    updated: 0,
    failures: [],
  };

  if (includeDebug) {
    summary.search_debug = [];
  }

  try {
    const response = await fetch(search.fetchedUrl, {
      headers: { "user-agent": "itch-rpg-feed-worker/1.0" },
    });

    if (!response.ok) {
      summary.failures.push({
        fetched_url: search.fetchedUrl,
        status: response.status,
      });
      summary.finished_at = new Date().toISOString();
      return summary;
    }

    const xml = await response.text();
    const parsedItems = parseXmlItems(xml, search.fetchedUrl);
    summary.items_seen = parsedItems.length;

    if (includeDebug) {
      summary.search_debug.push({
        ...normalizeSource(search),
        fetched_url: search.fetchedUrl,
        item_count: parsedItems.length,
        preview_items: parsedItems.slice(0, previewItemsPerSearch).map(itemPreview),
      });
    }

    if (!dryRun) {
      for (const item of parsedItems) {
        if (isItemBanned(item, bans)) {
          summary.skipped_banned += 1;
          continue;
        }

        const result = await upsertItem(env, item, search);
        summary.inserted += result.inserted;
        summary.updated += result.updated;
      }
    }
  } catch (error) {
    summary.failures.push({
      fetched_url: search.fetchedUrl,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

async function runIngestionStep(env, options = {}) {
  const scopedRun = hasScopedStepOptions(options);
  const categories = scopedRun ? normalizeCategoryInput(options.category) : CATEGORIES;
  const tags = scopedRun ? normalizeTagInput(options.tag) : [];
  const maxSearches = scopedRun
    ? toBoundedInt(options.maxSearches, 1, 2000, 1)
    : Number.POSITIVE_INFINITY;
  const searches = buildSearches({ categories, tags, maxSearches });

  if (!searches.length) {
    return {
      started_at: new Date().toISOString(),
      dry_run: toBoolean(options.dryRun, false),
      scoped_run: scopedRun,
      selected_categories: categories.map((c) => c.slug),
      selected_terms: tags,
      total_searches: 0,
      processed_index: null,
      next_index: null,
      failures: [{ error: "No searches available to process" }],
      finished_at: new Date().toISOString(),
    };
  }

  let processedIndex = 0;
  let nextIndex = null;

  if (!scopedRun) {
    const cursor = await readIngestionCursor(env);
    processedIndex = cursor % searches.length;
    nextIndex = (processedIndex + 1) % searches.length;
  }

  const search = searches[processedIndex];

  const bans = await loadIngestionBans(env);
  const result = await runSingleSearch(env, search, { ...options, bans });

  if (!scopedRun && nextIndex != null) {
    await writeIngestionCursor(env, nextIndex);
  }

  return {
    ...result,
    scoped_run: scopedRun,
    selected_categories: categories.map((c) => c.slug),
    selected_terms: tags,
    total_searches: searches.length,
    processed_index: processedIndex,
    next_index: nextIndex,
  };
}

async function runIngestion(env, options = {}) {
  const maxSearches = toBoundedInt(options.maxSearches ?? env.MAX_SEARCHES_PER_RUN, 1, 2000, 120);
  const categories = normalizeCategoryInput(options.category);
  const tags = normalizeTagInput(options.tag);
  const dryRun = toBoolean(options.dryRun, false);
  const includeDebug = toBoolean(options.includeDebug, false);
  const previewItemsPerSearch = toBoundedInt(options.previewItemsPerSearch, 0, 20, 3);
  const bans = await loadIngestionBans(env);

  const searches = buildSearches({
    maxSearches,
    categories,
    tags,
  });

  const summary = {
    started_at: new Date().toISOString(),
    dry_run: dryRun,
    selected_categories: categories.map((c) => c.slug),
    selected_terms: tags,
    searches_attempted: searches.length,
    searches_succeeded: 0,
    searches_failed: 0,
    items_seen: 0,
    skipped_banned: 0,
    inserted: 0,
    updated: 0,
    failures: [],
  };

  if (includeDebug) {
    summary.search_debug = [];
  }

  for (const search of searches) {
    try {
      const response = await fetch(search.fetchedUrl, {
        headers: { "user-agent": "itch-rpg-feed-worker/1.0" },
      });

      if (!response.ok) {
        summary.searches_failed += 1;
        summary.failures.push({
          fetched_url: search.fetchedUrl,
          status: response.status,
        });
        continue;
      }

      const xml = await response.text();
      const parsedItems = parseXmlItems(xml, search.fetchedUrl);
      summary.searches_succeeded += 1;
      summary.items_seen += parsedItems.length;

      if (includeDebug) {
        summary.search_debug.push({
          ...normalizeSource(search),
          fetched_url: search.fetchedUrl,
          item_count: parsedItems.length,
          preview_items: parsedItems.slice(0, previewItemsPerSearch).map(itemPreview),
        });
      }

      if (!dryRun) {
        for (const item of parsedItems) {
          if (isItemBanned(item, bans)) {
            summary.skipped_banned += 1;
            continue;
          }

          const result = await upsertItem(env, item, search);
          summary.inserted += result.inserted;
          summary.updated += result.updated;
        }
      }
    } catch (error) {
      summary.searches_failed += 1;
      summary.failures.push({
        fetched_url: search.fetchedUrl,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

function extractIngestionOptions(request, body = null) {
  const url = new URL(request.url);
  const query = url.searchParams;

  const source = body && typeof body === "object" ? body : {};

  return {
    category: source.category ?? query.get("category") ?? "",
    tag: source.tag ?? query.get("tag") ?? "",
    maxSearches: source.maxSearches ?? query.get("maxSearches"),
    dryRun: source.dryRun ?? query.get("dryRun") ?? query.get("debug"),
    includeDebug: source.includeDebug ?? query.get("includeDebug") ?? true,
    previewItemsPerSearch: source.previewItemsPerSearch ?? query.get("previewItemsPerSearch") ?? query.get("preview"),
  };
}

function listSearches(request) {
  const options = extractIngestionOptions(request);
  const categories = normalizeCategoryInput(options.category);
  const tags = normalizeTagInput(options.tag);
  const maxSearches = toBoundedInt(options.maxSearches, 1, 2000, 120);
  const searches = buildSearches({
    maxSearches,
    categories,
    tags,
  });

  return json({
    count: searches.length,
    selected_categories: categories.map((c) => c.slug),
    selected_terms: tags,
    searches,
  });
}

async function listItems(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const category = (url.searchParams.get("category") || "").trim().toLowerCase();
  const tag = (url.searchParams.get("tag") || "").trim().toLowerCase();
  const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit") || "5000")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));

  const results = await env.DB.prepare(
    `SELECT
      url, source, title, description, image_url, price, publish_date, update_date,
      author, author_url, language, rating, engagement, ai, first_seen_at, updated_at
     FROM items
     ORDER BY updated_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all();

  const rows = (results.results || []).map((row) => {
    let source = [];
    try {
      const parsed = JSON.parse(row.source || "[]");
      source = Array.isArray(parsed) ? parsed : [];
    } catch {
      source = [];
    }

    return {
      ...row,
      source,
    };
  });

  const filtered = rows.filter((row) => {
    const title = (row.title || "").toLowerCase();
    const description = (row.description || "").toLowerCase();

    const textMatch = !q || title.includes(q) || description.includes(q);

    const categoryMatch =
      !category ||
      row.source.some((s) =>
        (s.category || "").toLowerCase() === category ||
        (s.category_slug || "").toLowerCase() === category
      );

    const tagMatch = !tag || row.source.some((s) => (s.term || "").toLowerCase() === tag);

    return textMatch && categoryMatch && tagMatch;
  });

  return json({
    count: filtered.length,
    items: filtered,
    pagination: {
      limit,
      offset,
      has_more: (results.results || []).length === limit,
      next_offset: offset + limit,
    },
    filters: {
      category,
      tag,
      q,
      limit,
      offset,
    },
  });
}

function listMetadata() {
  return json({
    categories: CATEGORIES,
    tags: SEARCH_TERMS,
  });
}

async function newsletterPreview(request, env) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rows = await env.DB.prepare(
    `SELECT
      url, source, title, description, image_url, price, publish_date, update_date,
      author, author_url, language, rating, engagement, ai, first_seen_at, updated_at
     FROM items
     ORDER BY updated_at DESC
     LIMIT 6000`
  ).all();

  const inputItems = rows.results || [];
  const preview = prepareNewsletterPreview(inputItems, body || {}, new Date());

  return json({
    count: preview.items.length,
    items: preview.items,
    html: preview.html,
  });
}

function isAdminAuthorized(request, env) {
  const required = String(env.ADMIN_TOKEN || "").trim();
  if (!required) return true;

  const supplied = String(request.headers.get("x-admin-token") || "").trim();
  return supplied === required;
}

async function banEntity(request, env) {
  if (!isAdminAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const kind = String(body?.kind || "").trim().toLowerCase();
  const value = normalizeBanValue(body?.value);
  const reason = String(body?.reason || "").trim();
  const createdBy = String(body?.createdBy || "").trim();

  if (!["url", "author"].includes(kind)) {
    return json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!value) {
    return json({ error: "value is required" }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO ingest_bans (kind, value, reason, created_by, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(kind, value) DO UPDATE SET
       reason = excluded.reason,
       created_by = excluded.created_by,
       created_at = CURRENT_TIMESTAMP`
  )
    .bind(kind, value, reason, createdBy)
    .run();

  const countQuery = kind === "url"
    ? "SELECT COUNT(*) AS count FROM items WHERE lower(trim(url)) = ?"
    : "SELECT COUNT(*) AS count FROM items WHERE lower(trim(author)) = ?";

  const deleteQuery = kind === "url"
    ? "DELETE FROM items WHERE lower(trim(url)) = ?"
    : "DELETE FROM items WHERE lower(trim(author)) = ?";

  const existingCountRow = await env.DB.prepare(countQuery)
    .bind(value)
    .first();

  const removedCount = Number(existingCountRow?.count || 0);

  if (removedCount > 0) {
    await env.DB.prepare(deleteQuery)
      .bind(value)
      .run();
  }

  return json({ ok: true, kind, value, removed_count: removedCount });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/items") {
      return listItems(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/metadata") {
      return listMetadata();
    }

    if (request.method === "POST" && url.pathname === "/api/newsletter/preview") {
      return newsletterPreview(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/searches") {
      return listSearches(request);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/refresh-debug") {
      const options = applyDebugSamplingOptions(extractIngestionOptions(request, null));
      const summary = await runIngestion(env, {
        ...options,
        dryRun: options.dryRun ?? true,
        includeDebug: true,
      });
      summary.sampled_tags = options.sampled_tags;
      return json(summary);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/refresh") {
      let body = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }

      const options = extractIngestionOptions(request, body);
      const summary = await runIngestionStep(env, options);
      return json(summary);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/refresh-debug") {
      let body = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }

      const options = applyDebugSamplingOptions(extractIngestionOptions(request, body));
      const summary = await runIngestion(env, {
        ...options,
        includeDebug: true,
      });
      summary.sampled_tags = options.sampled_tags;
      return json(summary);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/ban") {
      return banEntity(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runIngestionStep(env));
  },
};
