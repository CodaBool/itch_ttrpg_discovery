import { prepareNewsletterPreview } from "../src/newsletter.js";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

function html(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");

  return new Response(String(body || ""), {
    ...init,
    headers,
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePreferenceJson(rawPreference) {
  if (!rawPreference) return {};

  if (typeof rawPreference === "object") {
    return rawPreference;
  }

  try {
    const parsed = JSON.parse(String(rawPreference));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildSubject(now = new Date()) {
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(now);
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(now);
  return `Your Indie TTRPG Digest - ${month}`;
}

async function loadItems(env) {
  const rows = await env.DB.prepare(
    `SELECT
      url, source, title, description, image_url, price, publish_date, update_date,
      author, author_url, language, rating, engagement, ai, first_seen_at, updated_at
     FROM items
     ORDER BY updated_at DESC
     LIMIT 6000`
  ).all();

  return rows.results || [];
}

async function loadAllSubscriptions(env) {
  const rows = await env.DB.prepare(
    `SELECT email, preference_json
     FROM newsletter_subscriptions
     ORDER BY updated_at DESC`
  ).all();

  return rows.results || [];
}

async function loadSubscriptionByEmail(env, email) {
  const row = await env.DB.prepare(
    `SELECT email, preference_json
     FROM newsletter_subscriptions
     WHERE lower(trim(email)) = ?`
  )
    .bind(normalizeEmail(email))
    .first();

  return row || null;
}

async function deleteSubscriptionByEmail(env, email) {
  await env.DB.prepare(
    `DELETE FROM newsletter_subscriptions
     WHERE lower(trim(email)) = ?`
  )
    .bind(normalizeEmail(email))
    .run();
}

async function sendEmail(env, toEmail, subject, html) {
  const fromName = "indie ttrpg discovery";
  const deliverySecret = String(env?.EMAIL_WORKER_SECRET || "").trim();
  const deliveryUrlBase = "https://email.codabool.workers.dev";

  if (!deliverySecret) {
    throw new Error("Missing EMAIL_WORKER_SECRET env var");
  }

  const urlParams = new URLSearchParams({
    subject,
    to: toEmail,
    name: "Indie TTRPG Digest",
    from: fromName,
    secret: deliverySecret,
  }).toString();

  const response = await fetch(`${deliveryUrlBase}/?${urlParams}`, {
    method: "POST",
    body: String(html || ""),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Mail send failed (${response.status}): ${message.slice(0, 300)}`);
  }
}

async function sendForSubscription(env, items, subscription, now = new Date()) {
  const email = normalizeEmail(subscription.email);
  const preference = parsePreferenceJson(subscription.preference_json);

  const preview = prepareNewsletterPreview(items, {
    ...preference,
    title: preference.title || "Your Indie TTRPG Digest",
  }, now);

  await sendEmail(env, email, buildSubject(now), preview.html);

  return {
    email,
    items_count: preview.items.length,
  };
}

async function runMonthlySend(env, now = new Date()) {
  const [items, subscriptions] = await Promise.all([
    loadItems(env),
    loadAllSubscriptions(env),
  ]);

  const summary = {
    started_at: now.toISOString(),
    processed: 0,
    sent: 0,
    failed: 0,
    results: [],
  };

  for (const subscription of subscriptions) {
    const email = normalizeEmail(subscription.email);
    if (!email) continue;

    summary.processed += 1;

    try {
      const result = await sendForSubscription(env, items, subscription, now);
      summary.sent += 1;
      summary.results.push({ ...result, ok: true });
    } catch (error) {
      summary.failed += 1;
      summary.results.push({
        email,
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}

async function handleManualSend(request, env) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const url = new URL(request.url);
  const email = normalizeEmail(body?.email ?? url.searchParams.get("email"));
  const providedSecret = String(url.searchParams.get("secret") || "").trim();
  const configuredSecret = String(env?.EMAIL_WORKER_SECRET || "").trim();

  if (!email) {
    return json({ error: "email is required" }, { status: 400 });
  }

  if (providedSecret !== configuredSecret) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const [items, subscription] = await Promise.all([
    loadItems(env),
    loadSubscriptionByEmail(env, email),
  ]);

  if (!subscription) {
    return json({ error: "No subscription found for email" }, { status: 404 });
  }

  try {
    const result = await sendForSubscription(env, items, subscription, new Date());
    return json({ ok: true, ...result });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    }, { status: 500 });
  }
}

async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("email"));

  if (!email) {
    return json({ error: "email is required" }, { status: 400 });
  }

  await deleteSubscriptionByEmail(env, email);

  return html(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unsubscribe</title>
  </head>
  <body style="margin:0; min-height:100vh; display:grid; place-items:center; background:#0f172a; color:#e2e8f0; font-family:Arial,sans-serif;">
    <main style="display:flex; flex-direction:column; align-items:center; gap:18px;">
      <h1 style="margin:0; font-size:32px; letter-spacing:0.08em; text-transform:uppercase;">Unsubscribed Successfully</h1>
      <a href="https://discover.codabool.workers.dev/" aria-label="Go home" style="display:inline-flex; align-items:center; justify-content:center; width:54px; height:54px; border:1px solid rgba(226,232,240,0.35); border-radius:12px; color:#e2e8f0; text-decoration:none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      </a>
    </main>
  </body>
</html>`);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "POST") {
      return handleManualSend(request, env);
    }

    if (request.method === "DELETE") {
      return handleUnsubscribe(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMonthlySend(env));
  },
};
