import puppeteer from "puppeteer";
import { XMLParser } from "fast-xml-parser";

const PAIR_TAGS = [
  "horror",
  "body-horror",
  "generation",
  "generated",
  "generator",
  "tool",
];

const SOLO_TAGS = [
  "zine",
  "one-page",
  "rules-lite",
  "supplement",
  "fanzine",
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
];

const CATEGORIES = [
  { name: "Assets", slug: "game-assets" },
  { name: "Physical Game", slug: "physical-games" },
  { name: "Tool", slug: "tools" },
];

const SEARCH_DEFINITIONS = [
  ...PAIR_TAGS.map((tag) => ({
    tags: ["ttrpg", tag],
    term: `ttrpg+${tag}`,
  })),
  ...SOLO_TAGS.map((tag) => ({
    tags: [tag],
    term: tag,
  })),
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function asList(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const author = parseAuthorFromGuid(guid);
  return author ? `https://${author}.itch.io` : "";
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
  const incomingKey = `${normalizedIncoming.category_slug}|${normalizedIncoming.term}|${normalizedIncoming.source_search}`;

  const dedup = new Map();
  for (const source of parsed) {
    const key = `${source.category_slug}|${source.term}|${source.source_search}`;
    dedup.set(key, source);
  }
  dedup.set(incomingKey, normalizedIncoming);

  return JSON.stringify(Array.from(dedup.values()));
}

function normalizeItem(item) {
  const link = textValue(item.link);
  const title = textValue(item.plainTitle) || textValue(item.title);

  if (!link || !title) return null;

  return {
    url: link,
    title,
    description: stripHtmlAndNormalizeWhitespace(textValue(item.description)),
    image_url: textValue(item.imageurl),
    price: textValue(item.price),
    publish_date: textValue(item.pubDate),
    update_date: textValue(item.updateDate),
    author: parseAuthorFromGuid(item.guid),
    author_url: parseAuthorUrlFromFetchedUrl(item.guid),
  };
}

function parseXmlItems(xml) {
  const parsed = xmlParser.parse(xml);
  const root = parsed?.rss?.channel || parsed?.feed || {};
  const rawItems = root.item || root.entry || [];
  const itemList = Array.isArray(rawItems) ? rawItems : [rawItems];

  const normalized = [];
  for (const entry of itemList) {
    const row = normalizeItem(entry);
    if (row) normalized.push(row);
  }

  return normalized;
}

function buildSearches({ categories, tags, maxSearches, startIndex }) {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const searches = [];

  for (const definition of SEARCH_DEFINITIONS) {
    for (const category of categories) {
      const shouldInclude =
        tagSet.size === 0 || definition.tags.some((tag) => tagSet.has(tag.toLowerCase()));

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

  const safeStartIndex = Math.max(0, Math.min(startIndex, Math.max(0, searches.length - 1)));
  const sliced = searches.slice(safeStartIndex, safeStartIndex + maxSearches);

  return {
    totalSearches: searches.length,
    selectedSearches: sliced,
    startIndex: safeStartIndex,
  };
}

class CloudflareD1Client {
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

  async first(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }
}

async function upsertItem(client, item, source, dryRun) {
  if (dryRun) return { inserted: 0, updated: 0 };

  const existing = await client.first("SELECT source FROM items WHERE url = ? LIMIT 1", [item.url]);

  if (!existing) {
    await client.query(
      `INSERT INTO items (
        url, source, title, description, image_url, price, publish_date, update_date,
        author, author_url, first_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
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
      ]
    );

    return { inserted: 1, updated: 0 };
  }

  const mergedSource = mergeSource(existing.source, source);

  await client.query(
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
         updated_at = CURRENT_TIMESTAMP
     WHERE url = ?`,
    [
      mergedSource,
      item.title,
      item.description,
      item.image_url,
      item.price,
      item.publish_date,
      item.update_date,
      item.author,
      item.author_url,
      item.url,
    ]
  );

  return { inserted: 0, updated: 1 };
}

async function fetchXmlWithRetries(page, url, retryConfig, counters) {
  let lastError = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt += 1) {
    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: retryConfig.requestTimeoutMs,
      });

      if (!response) {
        throw new Error("No response received from page navigation");
      }

      const status = response.status();
      const isRetryableStatus = status === 403 || status === 429 || status >= 500;

      if (status === 403) counters.http403 += 1;
      if (status === 429) counters.http429 += 1;

      if (status < 200 || status >= 300) {
        const details = `HTTP ${status} for ${url}`;

        if (!isRetryableStatus || attempt === retryConfig.maxRetries) {
          return { ok: false, status, error: details, attempts: attempt + 1 };
        }

        const delay = Math.min(
          retryConfig.maxDelayMs,
          Math.floor(
            retryConfig.baseDelayMs * retryConfig.multiplier ** attempt +
              Math.random() * retryConfig.jitterMs
          )
        );

        console.log(
          `[retry ${attempt + 1}/${retryConfig.maxRetries}] ${details}; waiting ${delay}ms before retry`
        );

        await sleep(delay);
        continue;
      }

      const xml = await response.text();
      return { ok: true, status, xml, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;

      if (attempt === retryConfig.maxRetries) {
        break;
      }

      const delay = Math.min(
        retryConfig.maxDelayMs,
        Math.floor(
          retryConfig.baseDelayMs * retryConfig.multiplier ** attempt +
            Math.random() * retryConfig.jitterMs
        )
      );

      console.log(
        `[retry ${attempt + 1}/${retryConfig.maxRetries}] request failed for ${url}: ${error.message}; waiting ${delay}ms`
      );

      await sleep(delay);
    }
  }

  return {
    ok: false,
    status: null,
    error: lastError ? lastError.message : "unknown error",
    attempts: retryConfig.maxRetries + 1,
  };
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

async function main() {
  const accountId = mustEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = mustEnv("CLOUDFLARE_D1_DATABASE_ID");
  const apiToken = mustEnv("CLOUDFLARE_API_TOKEN");

  const dryRun = toBool(process.env.LOCAL_DRY_RUN, false);
  const maxSearches = Math.max(1, toInt(process.env.LOCAL_MAX_SEARCHES, 120));
  const startIndex = Math.max(0, toInt(process.env.LOCAL_START_INDEX, 0));

  const selectedCategoryInput = asList(process.env.LOCAL_CATEGORIES);
  const selectedTagInput = asList(process.env.LOCAL_TAGS);

  const categories =
    selectedCategoryInput.length === 0
      ? CATEGORIES
      : CATEGORIES.filter(
          (c) =>
            selectedCategoryInput.includes(c.slug) ||
            selectedCategoryInput.includes(c.name) ||
            selectedCategoryInput.includes(c.slug.toLowerCase()) ||
            selectedCategoryInput.includes(c.name.toLowerCase())
        );

  const retryConfig = {
    maxRetries: Math.max(0, toInt(process.env.LOCAL_MAX_RETRIES, 4)),
    baseDelayMs: Math.max(100, toInt(process.env.LOCAL_BACKOFF_BASE_MS, 1250)),
    multiplier: Math.max(1, Number(process.env.LOCAL_BACKOFF_MULTIPLIER || 2)),
    maxDelayMs: Math.max(100, toInt(process.env.LOCAL_BACKOFF_MAX_MS, 30000)),
    jitterMs: Math.max(0, toInt(process.env.LOCAL_BACKOFF_JITTER_MS, 250)),
    requestTimeoutMs: Math.max(1000, toInt(process.env.LOCAL_REQUEST_TIMEOUT_MS, 30000)),
  };

  const { totalSearches, selectedSearches, startIndex: safeStartIndex } = buildSearches({
    categories,
    tags: selectedTagInput,
    maxSearches,
    startIndex,
  });

  if (selectedSearches.length === 0) {
    console.log("No searches selected. Check LOCAL_CATEGORIES/LOCAL_TAGS/LOCAL_MAX_SEARCHES.");
    return;
  }

  const counters = {
    processedSearches: 0,
    successfulSearches: 0,
    failedSearches: 0,
    itemsSeen: 0,
    inserted: 0,
    updated: 0,
    http403: 0,
    http429: 0,
  };

  console.log("Starting local XML refresh with Chrome + remote D1 upserts");
  console.log(`Dry run: ${dryRun}`);
  console.log(`Selected searches: ${selectedSearches.length} (from total ${totalSearches}, start index ${safeStartIndex})`);
  console.log(
    `Backoff config: retries=${retryConfig.maxRetries}, base=${retryConfig.baseDelayMs}ms, multiplier=${retryConfig.multiplier}, max=${retryConfig.maxDelayMs}ms, jitter=${retryConfig.jitterMs}ms`
  );

  const browser = await puppeteer.launch({
    headless: toBool(process.env.LOCAL_CHROME_HEADLESS, false),
    executablePath: process.env.LOCAL_CHROME_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    process.env.LOCAL_USER_AGENT ||
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
  );

  const d1 = new CloudflareD1Client({ accountId, databaseId, apiToken });

  const failures = [];

  try {
    for (let i = 0; i < selectedSearches.length; i += 1) {
      const search = selectedSearches[i];
      counters.processedSearches += 1;

      console.log(
        `\n[${counters.processedSearches}/${selectedSearches.length}] Refreshing ${search.categorySlug}:${search.term}`
      );
      console.log(`URL: ${search.fetchedUrl}`);

      const fetched = await fetchXmlWithRetries(page, search.fetchedUrl, retryConfig, counters);

      if (!fetched.ok) {
        counters.failedSearches += 1;
        failures.push({
          fetched_url: search.fetchedUrl,
          category: search.categorySlug,
          term: search.term,
          status: fetched.status,
          error: fetched.error,
          attempts: fetched.attempts,
        });
        console.log(`Failed search after ${fetched.attempts} attempt(s): ${fetched.error}`);
        continue;
      }

      let items = [];
      try {
        items = parseXmlItems(fetched.xml);
      } catch (error) {
        counters.failedSearches += 1;
        failures.push({
          fetched_url: search.fetchedUrl,
          category: search.categorySlug,
          term: search.term,
          status: fetched.status,
          error: `XML parse error: ${error.message}`,
          attempts: fetched.attempts,
        });
        console.log(`XML parse failure: ${error.message}`);
        continue;
      }

      counters.successfulSearches += 1;
      counters.itemsSeen += items.length;

      let searchInserted = 0;
      let searchUpdated = 0;

      for (const item of items) {
        try {
          const upsert = await upsertItem(d1, item, search, dryRun);
          counters.inserted += upsert.inserted;
          counters.updated += upsert.updated;
          searchInserted += upsert.inserted;
          searchUpdated += upsert.updated;
        } catch (error) {
          failures.push({
            fetched_url: search.fetchedUrl,
            item_url: item.url,
            category: search.categorySlug,
            term: search.term,
            error: `D1 upsert failed: ${error.message}`,
          });
          console.log(`D1 upsert failure for ${item.url}: ${error.message}`);
        }
      }

      console.log(
        `Search complete: items=${items.length}, inserted=${searchInserted}, updated=${searchUpdated}, retriesUsed=${Math.max(0, fetched.attempts - 1)}`
      );
      console.log(
        `Progress: refreshed ${counters.processedSearches}/${selectedSearches.length} searches, total inserted=${counters.inserted}, updated=${counters.updated}`
      );
    }
  } finally {
    if (!toBool(process.env.LOCAL_KEEP_CHROME_OPEN, false)) {
      await browser.close();
    }
  }

  console.log("\n=== Final Summary ===");
  console.log(`Refreshed searches: ${counters.processedSearches}/${selectedSearches.length}`);
  console.log(`Succeeded searches: ${counters.successfulSearches}`);
  console.log(`Failed searches: ${counters.failedSearches}`);
  console.log(`Items seen: ${counters.itemsSeen}`);
  console.log(`Inserted: ${counters.inserted}`);
  console.log(`Updated: ${counters.updated}`);
  console.log(`HTTP 403 count: ${counters.http403}`);
  console.log(`HTTP 429 count: ${counters.http429}`);

  if (failures.length > 0) {
    console.log(`Failures captured: ${failures.length}`);
    for (const failure of failures.slice(0, 20)) {
      console.log(JSON.stringify(failure));
    }
    if (failures.length > 20) {
      console.log(`... plus ${failures.length - 20} more failures`);
    }
  }

  console.log("\nBackoff tuning knobs (env vars):");
  console.log("LOCAL_MAX_RETRIES (default 4)");
  console.log("LOCAL_BACKOFF_BASE_MS (default 1250)");
  console.log("LOCAL_BACKOFF_MULTIPLIER (default 2)");
  console.log("LOCAL_BACKOFF_MAX_MS (default 30000)");
  console.log("LOCAL_BACKOFF_JITTER_MS (default 250)");
}

main().catch((error) => {
  console.error("local.mjs failed:", error);
  process.exitCode = 1;
});
