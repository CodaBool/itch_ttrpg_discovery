import { detectAll } from "tinyld";
import {
  DETAIL_ACTIONS,
  WorkerD1Client,
  parseDetailFromHtml,
  runSingleDetailStep,
  toBool,
  toInt,
} from "./shared.js";

const FETCHES_PER_REQUEST = 5;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

function parseOptions(request, body = null, env = {}) {
  const url = new URL(request.url);
  const query = url.searchParams;
  const source = body && typeof body === "object" ? body : {};

  return {
    dryRun: toBool(source.dryRun ?? query.get("dryRun"), false),
    staleDays: Math.max(1, toInt(source.staleDays ?? query.get("staleDays"), toInt(env.DETAIL_STALE_DAYS, 7))),
    requestTimeoutMs: Math.max(1000, toInt(source.requestTimeoutMs ?? query.get("requestTimeoutMs"), toInt(env.DETAIL_REQUEST_TIMEOUT_MS, 15000))),
  };
}

// cld (used by scripts/detail.mjs) is a native module, so the worker uses tinyld.
// Same contract: ISO 639-1 code, English stored as null, null when unsure.
function detectLanguage(rawText) {
  const normalized = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const letterCount = (normalized.match(/\p{L}/gu) || []).length;
  if (letterCount < 120) return null;

  const [top, second] = detectAll(normalized);
  const langCode = String(top?.lang || "").trim().toLowerCase();
  if (!langCode || langCode === "en") return null;

  // Mixed-language pages (e.g. EN + PT side by side) split the score; require a clear winner.
  const topAccuracy = Number(top.accuracy) || 0;
  const secondAccuracy = Number(second?.accuracy) || 0;
  if (topAccuracy < 0.3 || topAccuracy - secondAccuracy < 0.15) return null;

  // tinyld can name a non-Latin language for Latin text (e.g. Hindi for English with Swedish names),
  // so the text has to actually be written in the language's script.
  const latinShare = (normalized.match(/\p{Script=Latin}/gu) || []).length / letterCount;
  const script = languageScript(langCode);
  if (script === "Latn" && latinShare < 0.5) return null;
  if (script && script !== "Latn" && latinShare > 0.8) return null;

  return langCode;
}

function languageScript(langCode) {
  try {
    return new Intl.Locale(langCode).maximize().script || null;
  } catch {
    return null;
  }
}

async function fetchAndParseDetail(url, requestTimeoutMs, userAgent) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": userAgent,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }

    const html = await response.text();
    console.log(url)

    return parseDetailFromHtml(html);

  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`HTTP timeout after ${requestTimeoutMs}ms`);
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runDetailStep(env, options) {
  const db = new WorkerD1Client(env.DB);
  const userAgent = String(env.DETAIL_USER_AGENT || "itch-rpg-feed-detail-worker/1.0");

  const runs = [];
  const total = Math.max(1, FETCHES_PER_REQUEST);

  for (let i = 0; i < total; i += 1) {
    const stepSummary = await runSingleDetailStep({
      db,
      dryRun: options.dryRun,
      staleDays: options.staleDays,
      // Dry runs write nothing, so without this every step would pick the same row.
      skipUrls: runs.map((row) => row.processed_url),
      fetchDetail: (url) => fetchAndParseDetail(url, options.requestTimeoutMs, userAgent),
      detectLanguage: async (text) => detectLanguage(text),
    });
    runs.push(stepSummary);
  }

  const aggregate = { attempted_steps: runs.length };
  for (const action of DETAIL_ACTIONS) {
    aggregate[action] = runs.filter((row) => row.action === action).length;
  }
  aggregate.empty = runs.filter((row) => row.action === "none").length;

console.log({
    fetches_per_request: total,
    aggregate,
    runs,
  });


  return {
    fetches_per_request: total,
    aggregate,
    runs,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/detail/health") {
      return json({ ok: true, service: "detail-worker" });
    }

    if (request.method === "POST" && url.pathname === "/api/detail/step") {
      let body = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }

      const options = parseOptions(request, body, env);
      const summary = await runDetailStep(env, options);
      return json(summary);
    }

    return json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    const options = {
      dryRun: false,
      staleDays: Math.max(1, toInt(env.DETAIL_STALE_DAYS, 7)),
      requestTimeoutMs: Math.max(1000, toInt(env.DETAIL_REQUEST_TIMEOUT_MS, 15000)),
    };

    ctx.waitUntil(runDetailStep(env, options));
  },
};
