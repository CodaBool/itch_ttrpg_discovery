import { prepareNewsletterPreview } from "../src/newsletter.js";

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");

  return new Response(JSON.stringify(data), {
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
  return `Your Indie TTRPG Digest - ${month} ${year}`;
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

async function sendEmail(env, toEmail, subject, html) {
  const fromName = "indie-ttrpg-discovery@codabool.com";
  const deliverySecret = String(env?.EMAIL_WORKER_SECRET || "").trim();
  const deliveryUrlBase = "https://email.codabool.workers.dev";

  if (!deliverySecret) {
    throw new Error("Missing EMAIL_WORKER_SECRET env var");
  }

  const recipientName = toEmail.split("@")[0] || "subscriber";

  // Keep this request shape aligned with test.junk.js, which is known-good.
  const urlParams = new URLSearchParams({
    subject,
    to: toEmail,
    name: recipientName,
    from: fromName,
    secret: deliverySecret,
  }).toString();

  console.log("[email-worker] outbound request", {
    endpoint: deliveryUrlBase,
    query: {
      subject,
      to: toEmail,
      name: recipientName,
      from: fromName,
      secret: "[redacted]",
    },
    body_bytes: String(html || "").length,
  });

  const response = await fetch(`${deliveryUrlBase}/?${urlParams}`, {
    method: "POST",
    body: String(html || ""),
  });

  console.log("[email-worker] outbound response", {
    status: response.status,
    ok: response.ok,
    recipient: toEmail,
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

  console.log('lets see that html')
  console.log(preview.html)

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

  console.log("[email-worker] manual send request", {
    method: request.method,
    has_body: body != null,
    email,
    has_secret: Boolean(providedSecret),
    has_configured_secret: Boolean(configuredSecret),
  });

  if (!email) {
    console.log("[email-worker] manual send rejected", { reason: "missing_email" });
    return json({ error: "email is required" }, { status: 400 });
  }

  if (providedSecret !== configuredSecret) {
    console.log("[email-worker] manual send rejected", { reason: "unauthorized" });
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const [items, subscription] = await Promise.all([
    loadItems(env),
    loadSubscriptionByEmail(env, email),
  ]);

  console.log("[email-worker] manual send loaded data", {
    items_count: items.length,
    subscription_found: Boolean(subscription),
    email,
  });

  if (!subscription) {
    console.log("[email-worker] manual send rejected", { reason: "subscription_not_found", email });
    return json({ error: "No subscription found for email" }, { status: 404 });
  }

  try {
    const result = await sendForSubscription(env, items, subscription, new Date());
    console.log("[email-worker] manual send success", {
      email,
      items_count: result.items_count,
    });
    return json({ ok: true, ...result });
  } catch (error) {
    console.log("[email-worker] manual send failed", {
      email,
      error: error instanceof Error ? error.message : "unknown error",
      stack: error instanceof Error ? error.stack : null,
    });
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    }, { status: 500 });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "POST") {
      return handleManualSend(request, env);
    }

    return json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runMonthlySend(env));
  },
};
