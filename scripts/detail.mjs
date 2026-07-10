import puppeteer from "puppeteer";
import cld from "cld";
import { pathToFileURL } from "node:url";
import {
  CloudflareD1Client,
  deriveDetailMetrics,
  shouldRemoveForLowRating,
  sleep,
  toBool,
  toInt,
} from "../worker/detail/shared.js";

const DETAIL_EXCLUDED_TAGS = new Set([
  "vtt-battlemaps",
  "foundry-vtt",
  "solo-rpg",
  "solo",
  "solo-ttrpg",
  "dnd5e",
  "dungeons-and-dragsons",
  "larp",
  "pathfinder",
  "diceless",
  "gm-less",
  "lancer",
]);

function mustEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function hasStrongRatingAndEngagement(rating, engagement) {
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

export async function openBrowserSession() {
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

export async function scrapeDetail(page, url) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: Math.max(1000, toInt(process.env.DETAIL_REQUEST_TIMEOUT_MS, 30000)),
  });

  if (!response) {
    throw new Error("No response received from page navigation");
  }

  const status = response.status();
  if (status < 200 || status >= 300) {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    throw err;
  }

  return page.evaluate(() => {
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const ratingEl = document.querySelector(".aggregate_rating");
    const ratingTooltip = ratingEl ? ratingEl.getAttribute("data-tooltip") : null;

    const topics = document.querySelector(".community_topics");
    const topicCount = topics ? topics.querySelectorAll(":scope > div").length : 0;

    const comments = document.querySelector(".community_post_list_widget");
    const commentCount = comments ? comments.querySelectorAll(":scope > div").length : 0;

    const noAiAnchor = document.querySelector('a[href*="/tag-no-ai"]');
    const aiAssistedAnchor = document.querySelector('a[href*="ai-assisted"]');

    const sourceTags = Array.from(document.querySelectorAll('a[href*="/tag-"]'))
      .map((anchor) => {
        const href = anchor.getAttribute("href") || "";
        const match = href.match(/\/tag-([^/?#]+)/i);
        return match ? String(match[1] || "").trim().toLowerCase() : "";
      })
      .filter(Boolean);

    const pageTitle =
      document.querySelector("h1.game_title")?.textContent ||
      document.querySelector("h1")?.textContent ||
      document.title ||
      "";

    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

    const richDescription =
      document.querySelector(".formatted_description")?.textContent ||
      document.querySelector(".game_description")?.textContent ||
      "";

    const languageText = normalize(`${pageTitle} ${metaDescription} ${richDescription}`).slice(0, 8000);

    return {
      ratingTooltip,
      topicCount,
      commentCount,
      ai: aiAssistedAnchor ? "ai assisted" : noAiAnchor ? "no ai" : null,
      sourceTags,
      languageText,
    };
  });
}
export async function detectLanguageIso3(rawText) {
  const normalized = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const letterCount = (normalized.match(/\p{L}/gu) || []).length;
  if (letterCount < 120) return null;

  try {
    const result = await cld.detect(normalized, {
      isHTML: false,
      bestEffort: true,
    });

    const top = Array.isArray(result?.languages) ? result.languages[0] : null;
    if (!top) return null;

    const langCode = String(top.code || "").trim().toLowerCase();
    if (!langCode) return null;

    // Keep existing behavior: English is stored as null.
    if (langCode === "en") return null;

    const percent = Number(top.percent);
    const reliable = Boolean(result?.reliable);

    // For non-reliable outputs, require stronger confidence.
    if (!reliable && (!Number.isFinite(percent) || percent < 85)) return null;

    return langCode;
  } catch {
    return null;
  }
}

export async function createDetailPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    process.env.LOCAL_USER_AGENT ||
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  );
  return page;
}

export async function recycleDetailPage(page, browser) {
  try {
    if (page && !page.isClosed()) {
      await page.close({ runBeforeUnload: false });
    }
  } catch {
    // Best-effort cleanup before creating a fresh page.
  }

  return createDetailPage(browser);
}

export async function closeBrowserSession(session) {
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

export async function fetchAllUrls(d1, { startOffset, maxItems, queryBatchSize }) {
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

export function makeBatches(urls, batchSize) {
  const batches = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push({
      batchNumber: batches.length + 1,
      urls: urls.slice(i, i + batchSize),
    });
  }

  return batches;
}

export async function runParallelDetailScrape() {
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
    removedLowRating: 0,
    removedAiAssisted: 0,
    removedExcludedTag: 0,
    failed: 0,
    skipped: 0,
    removed404: 0,
    completedBatches: 0,
  };

  const failures = [];
  const notFoundUrls = new Set();

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
          const metrics = deriveDetailMetrics(scraped);
          const rating = metrics.rating;
          const engagement = metrics.engagement;
          const ai = metrics.ai;
          const language = await detectLanguageIso3(scraped.languageText);
          const sourceTags = Array.isArray(scraped.sourceTags) ? scraped.sourceTags : [];

          const matchedExcludedTag = sourceTags.find((tag) =>
            DETAIL_EXCLUDED_TAGS.has(String(tag || "").trim().toLowerCase())
          );

          if (matchedExcludedTag) {
            const hasOverrideSignal = hasStrongRatingAndEngagement(rating, engagement);
            if (hasOverrideSignal) {
              console.log(
                `[worker-${workerId}] allowed ${url} despite excluded tag (${matchedExcludedTag}) due to strong rating/engagement`
              );
            } else {
            if (!dryRun) {
              await d1.execute("DELETE FROM items WHERE url = ?", [url]);
            }

            counters.removedExcludedTag += 1;
            console.log(
              `[worker-${workerId}] removed ${url} due to excluded tag (${matchedExcludedTag})`
            );
            counters.seen += 1;

            if (cooldownMs > 0) {
              await sleep(cooldownMs);
            }

            continue;
            }
          }

          if (String(ai || "").trim().toLowerCase() === "ai assisted") {
            if (!dryRun) {
              await d1.execute("DELETE FROM items WHERE url = ?", [url]);
            }

            counters.removedAiAssisted += 1;
            console.log(`[worker-${workerId}] removed ${url} due to ai assisted flag`);
            counters.seen += 1;

            if (cooldownMs > 0) {
              await sleep(cooldownMs);
            }

            continue;
          }

          if (shouldRemoveForLowRating(rating)) {
            if (!dryRun) {
              await d1.execute("DELETE FROM items WHERE url = ?", [url]);
            }

            counters.removedLowRating += 1;
            console.log(
              `[worker-${workerId}] removed ${url} due to low rating signal (${rating})`
            );
            counters.seen += 1;

            if (cooldownMs > 0) {
              await sleep(cooldownMs);
            }

            continue;
          }

          if (!dryRun) {
            await d1.execute(
              `UPDATE items
               SET rating = ?,
                   engagement = ?,
                   ai = ?,
                   language = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE url = ?`,
              [rating, engagement, ai, language, url]
            );
          }

          counters.updated += 1;
          console.log(
            `[worker-${workerId}] updated ${url} | rating=${rating ?? "null"} | engagement=${engagement} | ai=${ai ?? "null"} | language=${language ?? "null"}`
          );
        } catch (error) {
          counters.failed += 1;
          const is404 = error?.status === 404 || /HTTP\s+404/i.test(String(error?.message || ""));
          if (is404) {
            notFoundUrls.add(url);
          }
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

  if (notFoundUrls.size > 0) {
    if (dryRun) {
      console.log(`[cleanup] dry run: would delete ${notFoundUrls.size} URL(s) that returned HTTP 404`);
    } else {
      for (const missingUrl of notFoundUrls) {
        await d1.execute("DELETE FROM items WHERE url = ?", [missingUrl]);
        counters.removed404 += 1;
      }
      console.log(`[cleanup] deleted ${counters.removed404} URL(s) that returned HTTP 404`);
    }
  }

  console.log("\n=== Detail Summary ===");
  console.log(`Rows seen: ${counters.seen}`);
  console.log(`Rows updated: ${counters.updated}`);
  console.log(`Rows removed due to excluded tags: ${dryRun ? 0 : counters.removedExcludedTag}`);
  console.log(`Rows removed due to ai assisted: ${dryRun ? 0 : counters.removedAiAssisted}`);
  console.log(`Rows removed due to low rating: ${dryRun ? 0 : counters.removedLowRating}`);
  console.log(`Rows failed: ${counters.failed}`);
  console.log(`Rows skipped (no url): ${counters.skipped}`);
  console.log(`Rows removed due to 404: ${dryRun ? 0 : counters.removed404}`);
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

export async function main() {
  await runParallelDetailScrape();
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error("detail.mjs failed:", error);
    process.exitCode = 1;
  });
}
