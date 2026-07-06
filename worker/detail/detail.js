import {
  WorkerD1Client,
  parseDetailFromHtml,
  runSingleDetailStep,
  toBool,
  toInt,
} from "./shared.js";

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
    cursorKey: String(source.cursorKey ?? query.get("cursorKey") ?? env.DETAIL_CURSOR_KEY ?? "detail_cursor").trim() || "detail_cursor",
    requestTimeoutMs: Math.max(1000, toInt(source.requestTimeoutMs ?? query.get("requestTimeoutMs"), toInt(env.DETAIL_REQUEST_TIMEOUT_MS, 15000))),
  };
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

  return runSingleDetailStep({
    db,
    dryRun: options.dryRun,
    staleDays: options.staleDays,
    cursorKey: options.cursorKey,
    fetchDetail: (url) => fetchAndParseDetail(url, options.requestTimeoutMs, userAgent),
  });
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
      cursorKey: String(env.DETAIL_CURSOR_KEY || "detail_cursor"),
      requestTimeoutMs: Math.max(1000, toInt(env.DETAIL_REQUEST_TIMEOUT_MS, 15000)),
    };

    ctx.waitUntil(runDetailStep(env, options));
  },
};
