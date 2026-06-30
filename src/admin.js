function readEnv(name) {
  const viteEnv = typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env[`VITE_${name}`]
    : undefined;

  return String(viteEnv ?? "").trim();
}

function normalizeBanValue(value) {
  return String(value || "").trim().toLowerCase();
}

const API_BASE = readEnv("API_BASE_URL") || "https://itch-ttrpg-discovery.codabool.workers.dev";

export function isAdminEnabled() {
  return Boolean(readEnv("CLOUDFLARE_API_TOKEN"));
}

export function createAdminClientFromEnv() {
  return {
    apiBase: API_BASE,
    adminToken: readEnv("CLOUDFLARE_API_TOKEN"),
  };
}

async function postBan(client, kind, value, reason = "", createdBy = "") {
  const response = await fetch(`${client.apiBase}/api/admin/ban`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(client.adminToken ? { "x-admin-token": client.adminToken } : {}),
    },
    body: JSON.stringify({
      kind,
      value,
      reason: String(reason || "").trim(),
      createdBy: String(createdBy || "").trim(),
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

export async function banUrl(client, url, reason = "", createdBy = "") {
  const value = normalizeBanValue(url);
  if (!value) throw new Error("url is required");
  await postBan(client, "url", value, reason, createdBy);
}

export async function banAuthor(client, author, reason = "", createdBy = "") {
  const value = normalizeBanValue(author);
  if (!value) throw new Error("author is required");
  await postBan(client, "author", value, reason, createdBy);
}
