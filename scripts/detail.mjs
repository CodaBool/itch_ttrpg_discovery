import puppeteer from "puppeteer";

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

function mustEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
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
}

async function openBrowserSession() {
  const protocolTimeoutMs = Math.max(10000, toInt(process.env.DETAIL_PROTOCOL_TIMEOUT_MS, 120000));
  const launchHeadless = toBool(process.env.DETAIL_HEADLESS, true);
  const browser = await puppeteer.launch({
    headless: launchHeadless,
    executablePath: process.env.LOCAL_CHROME_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1400, height: 900 },
    protocolTimeout: protocolTimeoutMs,
  });

  return {
    browser,
    attached: false,
    description: `launched puppeteer-managed browser (headless=${launchHeadless})`,
  };
}

function parseRatingFromTooltip(tooltip) {
  if (!tooltip || typeof tooltip !== "string") return null;

  const match = tooltip
    .trim()
    .match(/([0-9]+(?:\.[0-9]+)?)\s+average rating from\s+([0-9]+)\s+total ratings?/i);

  if (!match) return null;

  const average = match[1];
  const totalRatings = match[2];
  return `${average}over${totalRatings}`;
}

async function scrapeDetail(page, url) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: Math.max(1000, toInt(process.env.DETAIL_REQUEST_TIMEOUT_MS, 30000)),
  });

  if (!response) {
    throw new Error("No response received from page navigation");
  }

  const status = response.status();
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}`);
  }

  return page.evaluate(() => {
    const ratingEl = document.querySelector(".aggregate_rating");
    const ratingTooltip = ratingEl ? ratingEl.getAttribute("data-tooltip") : null;

    const topics = document.querySelector(".community_topics");
    const topicCount = topics ? topics.querySelectorAll(":scope > div").length : 0;

    const comments = document.querySelector(".community_post_list_widget");
    const commentCount = comments ? comments.querySelectorAll(":scope > div").length : 0;

    const noAiAnchor = document.querySelector('a[href="https://itch.io/physical-games/tag-no-ai"]');
    const aiAssistedAnchor = document.querySelector('a[href="https://itch.io/game-assets/ai-assisted"]');

    return {
      ratingTooltip,
      topicCount,
      commentCount,
      ai: aiAssistedAnchor ? "ai assisted" : noAiAnchor ? "no ai" : null,
    };
  });
}

async function createDetailPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    process.env.LOCAL_USER_AGENT ||
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  );
  return page;
}

async function recycleDetailPage(page, browser) {
  try {
    if (page && !page.isClosed()) {
      await page.close({ runBeforeUnload: false });
    }
  } catch {
    // Best-effort cleanup before creating a fresh page.
  }

  return createDetailPage(browser);
}

async function closeBrowserSession(session) {
  if (!session?.browser) return;

  try {
    if (session.attached) {
      await session.browser.disconnect();
    } else {
      await session.browser.close();
    }
  } catch {
    // Best-effort cleanup for broken/crashed browser sessions.
  }
}

async function fetchAllUrls(d1, { startOffset, maxItems, queryBatchSize }) {
  const collected = [];
  let offset = startOffset;

  while (collected.length < maxItems) {
    const remaining = maxItems - collected.length;
    const limit = Math.min(queryBatchSize, remaining);

    const rows = await d1.query(
      "SELECT url FROM items ORDER BY first_seen_at ASC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const url = String(row.url || "").trim();
      collected.push(url);
    }

    offset += rows.length;

    if (rows.length < limit) break;
  }

  return collected;
}

function makeBatches(urls, batchSize) {
  const batches = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push({
      batchNumber: batches.length + 1,
      urls: urls.slice(i, i + batchSize),
    });
  }

  return batches;
}

async function main() {
  const accountId = mustEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = mustEnv("CLOUDFLARE_D1_DATABASE_ID");
  const apiToken = mustEnv("CLOUDFLARE_API_TOKEN");

  const batchSize = Math.max(1, toInt(process.env.DETAIL_BATCH_SIZE, 100));
  const workerCount = Math.max(1, toInt(process.env.DETAIL_PARALLEL_WORKERS, 5));
  const startOffset = Math.max(0, toInt(process.env.DETAIL_START_OFFSET, 0));
  const maxItems = Math.max(1, toInt(process.env.DETAIL_MAX_ITEMS, 1000000));
  const dryRun = toBool(process.env.DETAIL_DRY_RUN, false);
  const cooldownMs = Math.max(0, toInt(process.env.DETAIL_COOLDOWN_MS, 500));
  const preloadQueryBatchSize = Math.max(100, toInt(process.env.DETAIL_PRELOAD_QUERY_BATCH_SIZE, 1000));

  console.log("Starting parallel detail scrape over D1 items");
  console.log(`Dry run: ${dryRun}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Workers: ${workerCount}`);
  console.log(`Start offset: ${startOffset}`);
  console.log(`Max items: ${maxItems}`);
  console.log(`Preload query batch size: ${preloadQueryBatchSize}`);

  const d1 = new CloudflareD1Client({ accountId, databaseId, apiToken });

  const allUrls = await fetchAllUrls(d1, {
    startOffset,
    maxItems,
    queryBatchSize: preloadQueryBatchSize,
  });

  if (allUrls.length === 0) {
    console.log("No rows found to process.");
    return;
  }

  const batches = makeBatches(allUrls, batchSize);
  let nextBatchIndex = 0;

  function takeNextBatch() {
    if (nextBatchIndex >= batches.length) return null;
    const batch = batches[nextBatchIndex];
    nextBatchIndex += 1;
    return batch;
  }

  console.log(`Total rows loaded: ${allUrls.length}`);
  console.log(`Total batches: ${batches.length}`);

  const counters = {
    seen: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    completedBatches: 0,
  };

  const failures = [];

  async function processBatchWithWorker(workerId, batch) {
    let browserSession = null;
    let page = null;

    try {
      browserSession = await openBrowserSession();
      page = await createDetailPage(browserSession.browser);
      console.log(
        `[worker-${workerId}] started batch ${batch.batchNumber}/${batches.length} (${batch.urls.length} items)`
      );

      for (const url of batch.urls) {
        if (!url) {
          counters.skipped += 1;
          counters.seen += 1;
          continue;
        }

        try {
          const scraped = await scrapeDetail(page, url);
          const rating = parseRatingFromTooltip(scraped.ratingTooltip);
          const engagement = Number(scraped.topicCount || 0) + Number(scraped.commentCount || 0);
          const ai = scraped.ai || null;

          if (!dryRun) {
            await d1.query(
              `UPDATE items
               SET rating = ?,
                   engagement = ?,
                   ai = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE url = ?`,
              [rating, engagement, ai, url]
            );
          }

          counters.updated += 1;
          console.log(
            `[worker-${workerId}] updated ${url} | rating=${rating ?? "null"} | engagement=${engagement} | ai=${ai ?? "null"}`
          );
        } catch (error) {
          counters.failed += 1;
          failures.push({ worker: workerId, url, error: error.message });
          console.log(`[worker-${workerId}] failed ${url}: ${error.message}`);

          try {
            page = await recycleDetailPage(page, browserSession.browser);
          } catch (recycleError) {
            console.log(`[worker-${workerId}] page recycle failed: ${recycleError.message}`);
          }
        }

        counters.seen += 1;

        if (cooldownMs > 0) {
          await sleep(cooldownMs);
        }
      }
    } finally {
      await closeBrowserSession(browserSession);
      counters.completedBatches += 1;
      console.log(
        `[worker-${workerId}] finished batch ${batch.batchNumber}/${batches.length}; browsers are closed for this batch`
      );
    }
  }

  async function workerLoop(workerId) {
    while (true) {
      const batch = takeNextBatch();
      if (!batch) return;
      await processBatchWithWorker(workerId, batch);
    }
  }

  const activeWorkers = Math.min(workerCount, batches.length);
  await Promise.all(Array.from({ length: activeWorkers }, (_, index) => workerLoop(index + 1)));

  console.log("\n=== Detail Summary ===");
  console.log(`Rows seen: ${counters.seen}`);
  console.log(`Rows updated: ${counters.updated}`);
  console.log(`Rows failed: ${counters.failed}`);
  console.log(`Rows skipped (no url): ${counters.skipped}`);
  console.log(`Batches completed: ${counters.completedBatches}/${batches.length}`);

  if (failures.length > 0) {
    console.log(`Failures captured: ${failures.length}`);
    for (const failure of failures.slice(0, 50)) {
      console.log(JSON.stringify(failure));
    }
    if (failures.length > 50) {
      console.log(`... plus ${failures.length - 50} more failures`);
    }
  }

  console.log("\nDetail tuning knobs (env vars):");
  console.log("DETAIL_BATCH_SIZE (default 100)");
  console.log("DETAIL_START_OFFSET (default 0)");
  console.log("DETAIL_MAX_ITEMS (default 1000000)");
  console.log("DETAIL_DRY_RUN (default false)");
  console.log("DETAIL_COOLDOWN_MS (default 500)");
  console.log("DETAIL_PARALLEL_WORKERS (default 5)");
  console.log("DETAIL_PRELOAD_QUERY_BATCH_SIZE (default 1000)");
  console.log("DETAIL_PROTOCOL_TIMEOUT_MS (default 120000)");
  console.log("DETAIL_HEADLESS (default true)");
  console.log("DETAIL_REQUEST_TIMEOUT_MS (default 30000)");
}

main().catch((error) => {
  console.error("detail.mjs failed:", error);
  process.exitCode = 1;
});
