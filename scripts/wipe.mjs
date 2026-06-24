function mustEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

class CloudflareD1Client {
  constructor({ accountId, databaseId, apiToken }) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    this.apiToken = apiToken;
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
      throw new Error(`D1 HTTP ${response.status}: ${statusText}`);
    }

    if (!payload?.success) {
      const statusText = payload?.errors?.[0]?.message || "Cloudflare API returned success=false";
      throw new Error(`D1 API error: ${statusText}`);
    }

    const statement = Array.isArray(payload.result) ? payload.result[0] : payload.result;
    return statement?.results || [];
  }

  async first(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  }
}

async function itemCount(client) {
  const row = await client.first("SELECT COUNT(*) AS count FROM items");
  return Number(row?.count || 0);
}

async function main() {
  const accountId = mustEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = mustEnv("CLOUDFLARE_D1_DATABASE_ID");
  const apiToken = mustEnv("CLOUDFLARE_API_TOKEN");

  const d1 = new CloudflareD1Client({ accountId, databaseId, apiToken });

  const before = await itemCount(d1);
  console.log(`Items before wipe: ${before}`);

  await d1.query("DELETE FROM items");

  const after = await itemCount(d1);
  console.log(`Items after wipe: ${after}`);
  console.log(`Deleted rows: ${Math.max(0, before - after)}`);
}

main().catch((error) => {
  console.error("wipe.mjs failed:", error.message || error);
  process.exitCode = 1;
});
