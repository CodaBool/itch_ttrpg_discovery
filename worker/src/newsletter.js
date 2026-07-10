const DAY_MS = 24 * 60 * 60 * 1000;
const NEWSLETTER_WINDOW_DAYS = 30;

// Keep in sync with frontend system definitions.
export const SYSTEM_TAGS_BY_KEY = {
  "liminal-horror": ["liminal-horror"],
  mothership: ["mothership", "mothership-rpg", "panic-engine"],
  "mork-borg": ["mork-borg", "pirate-borg", "cyborg"],
  "delta-green": ["delta-green"],
  "call-of-cthulhu": ["call-of-cthulhu"],
  "triangle-agency": ["triangle-agency"],
  mausritter: ["mausritter"],
  cairn: ["cairn"],
  "into-the-odd": ["into-the-odd"],
  fist: ["fist"],
  brindlewood: ["brindlewood", "carved-from-brindlewood"],
  "electric-bastionland": ["electric-bastionland"],
  cain: ["cain"],
  "trophy-dark": ["trophy-dark"],
  "public-access": ["public-access"],
};

const DEFAULT_LEVEL = 4;

const LEVEL_REQUIREMENTS = {
  0: { minPositive: Number.POSITIVE_INFINITY, minEngagement: Number.POSITIVE_INFINITY },
  1: { minPositive: 5, minEngagement: 1 },
  2: { minPositive: 3, minEngagement: 0 },
  3: { minPositive: 2, minEngagement: 0 },
  4: { minPositive: 1, minEngagement: 0 },
  5: { minPositive: 0, minEngagement: 0 },
};

function coerceLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function normalizeAuthor(value) {
  return String(value || "").trim().toLowerCase();
}

function parseSourceArray(rawSource) {
  if (Array.isArray(rawSource)) return rawSource;
  if (typeof rawSource !== "string") return [];

  try {
    const parsed = JSON.parse(rawSource);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sourceTagSet(sourceArray) {
  const tags = new Set();
  sourceArray.forEach((source) => {
    if (Array.isArray(source?.tags)) {
      source.tags.forEach((tag) => tags.add(String(tag || "").trim().toLowerCase()));
      return;
    }

    if (typeof source?.term === "string") {
      source.term
        .split("+")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .forEach((tag) => tags.add(tag));
    }
  });
  return tags;
}

function matchedSystemKeysFromTags(tags) {
  return Object.keys(SYSTEM_TAGS_BY_KEY).filter((systemKey) => {
    const matchTags = SYSTEM_TAGS_BY_KEY[systemKey] || [systemKey];
    return matchTags.some((tag) => tags.has(String(tag || "").trim().toLowerCase()));
  });
}

function itemDate(item) {
  const raw = item.publish_date || item.update_date || item.first_seen_at || item.updated_at || "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function ratingMetrics(rawRating) {
  const value = String(rawRating || "").trim();
  if (!value.includes("over")) return { average: 0, count: 0 };

  const parts = value.split("over");
  if (parts.length !== 2) return { average: 0, count: 0 };

  const average = Number(parts[0]);
  const count = Number(parts[1]);

  return {
    average: Number.isFinite(average) ? average : 0,
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  };
}

function parseRatingCount(item) {
  const { count } = ratingMetrics(item.rating);
  return count;
}

function positiveRatingCount(item) {
  const { average, count } = ratingMetrics(item.rating);
  if (average < 4) return 0;
  return count;
}

function engagementCount(item) {
  const value = Number(item.engagement);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function categorySlugSet(sourceArray) {
  const slugs = new Set();
  sourceArray.forEach((source) => {
    const slug = String(source?.category_slug || "").trim().toLowerCase();
    if (slug) slugs.add(slug);
  });
  return slugs;
}

function selectedCategorySlugs(preference) {
  const selected = new Set(["physical-games"]);

  if (preference.addGameAssets) {
    selected.add("game-assets");
  }

  if (preference.addToolsMiscGameMods) {
    selected.add("tools");
    selected.add("misc");
    selected.add("game-mods");
  }

  return selected;
}

function matchesSystemRule(item, systemKey, level, sourceTags) {
  if (level <= 0) return false;

  const matchTags = SYSTEM_TAGS_BY_KEY[systemKey] || [systemKey];
  if (!matchTags.some((tag) => sourceTags.has(String(tag).toLowerCase()))) {
    return false;
  }

  if (level >= 5) return true;

  const requirement = LEVEL_REQUIREMENTS[level] || LEVEL_REQUIREMENTS[DEFAULT_LEVEL];
  const positive = positiveRatingCount(item);
  const engagement = engagementCount(item);

  if (positive < requirement.minPositive) return false;
  if (engagement < requirement.minEngagement) return false;

  return true;
}

function normalizeSystemScores(rawScores) {
  const input = rawScores && typeof rawScores === "object" ? rawScores : {};
  const normalized = {};

  Object.keys(SYSTEM_TAGS_BY_KEY).forEach((systemKey) => {
    normalized[systemKey] = coerceLevel(input[systemKey]);
  });

  Object.keys(input).forEach((systemKey) => {
    if (normalized[systemKey] == null) {
      normalized[systemKey] = coerceLevel(input[systemKey]);
    }
  });

  return normalized;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decodeHtmlEntities(value) {
  const raw = String(value || "");
  if (!raw || !raw.includes("&")) return raw;

  return raw
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function truncateText(value, maxLength) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatDate(raw) {
  const parsed = new Date(raw || "");
  if (Number.isNaN(parsed.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

function sourceTagsForDisplay(sourceArray) {
  const hidden = new Set(["ttrpg", "tabletop"]);
  const tags = [];
  const seen = new Set();

  sourceArray.forEach((source) => {
    if (Array.isArray(source?.tags)) {
      source.tags.forEach((tag) => {
        const normalized = String(tag || "").trim().toLowerCase();
        if (!normalized || hidden.has(normalized) || seen.has(normalized)) return;
        seen.add(normalized);
        tags.push(normalized);
      });
      return;
    }

    if (typeof source?.term === "string") {
      source.term
        .split("+")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .forEach((tag) => {
          if (hidden.has(tag)) return;
          if (seen.has(tag)) return;
          seen.add(tag);
          tags.push(tag);
        });
    }
  });

  return tags;
}

export function filterNewsletterItems(items, rawPreference = {}, now = new Date()) {
  const preference = {
    englishOnly: rawPreference.englishOnly !== false,
    minRatings: Number.isFinite(Number(rawPreference.minRatings))
      ? Math.max(0, Math.min(10, Math.floor(Number(rawPreference.minRatings))))
      : 1,
    addGameAssets: rawPreference.addGameAssets !== false,
    addToolsMiscGameMods: rawPreference.addToolsMiscGameMods !== false,
    excludedCreators: Array.isArray(rawPreference.excludedCreators)
      ? rawPreference.excludedCreators.map(normalizeAuthor).filter(Boolean)
      : [],
    systemScores: normalizeSystemScores(rawPreference.systems),
  };

  const cutoffMs = now.getTime() - NEWSLETTER_WINDOW_DAYS * DAY_MS;
  const excludedCreatorSet = new Set(preference.excludedCreators);
  const allowedCategories = selectedCategorySlugs(preference);

  const filtered = items.filter((item) => {
    const sourceArray = parseSourceArray(item.source);
    const sourceCategories = categorySlugSet(sourceArray);

    const date = itemDate(item);
    if (!date || date.getTime() < cutoffMs) return false;

    const categoryMatch = Array.from(allowedCategories).some((slug) => sourceCategories.has(slug));
    if (!categoryMatch) return false;

    if (preference.englishOnly && item.language != null) return false;

    const authorKey = normalizeAuthor(item.author);
    if (authorKey && excludedCreatorSet.has(authorKey)) return false;

    const tags = sourceTagSet(sourceArray);
    const matchedSystemKeys = matchedSystemKeysFromTags(tags);
    const hasAnySystemTag = matchedSystemKeys.length > 0;

    if (hasAnySystemTag) {
      for (const systemKey of matchedSystemKeys) {
        const level = coerceLevel(preference.systemScores[systemKey]);
        if (level <= 0) return false;
        if (!matchesSystemRule(item, systemKey, level, tags)) return false;
      }
      return true;
    }

    return parseRatingCount(item) >= preference.minRatings;
  });

  return filtered.sort((a, b) => {
    const da = itemDate(a);
    const db = itemDate(b);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });
}

export function buildNewsletterHtml(items, rawPreference = {}) {
  const preference = {
    title: String(rawPreference.title || "Your Indie TTRPG Digest").trim() || "Your Indie TTRPG Digest",
  };

  const cardsHtml = items.map((item) => {
    const sourceArray = parseSourceArray(item.source);
    const tags = sourceTagsForDisplay(sourceArray).slice(0, 6);
    const displayTitle = truncateText(decodeHtmlEntities(item.title || "Untitled"), 90);
    const description = truncateText(
      decodeHtmlEntities(String(item.description || "No description available.").trim()),
      200
    );
    const authorRaw = decodeHtmlEntities(item.author || "unknown");
    const authorText = escapeHtml(authorRaw);
    const authorLink = item.author_url
      ? `<a href="${escapeHtml(item.author_url)}" target="_blank" rel="noopener noreferrer" style="color: #0369a1; text-decoration: none;">${authorText}</a>`
      : authorText;

    return `
      <article class="card" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff; min-width: 0;">
        ${item.image_url ? `
          <div class="card-image-frame" style="position:relative; width:100%; padding-top:87.91%; overflow:hidden; background:#0b1220;">
            <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" style="position:absolute; inset:0; display:block; width:100%; height:100%; object-fit:cover;" />
          </div>
        ` : ""}
        <div style="padding: 12px 14px; font-family: Arial, sans-serif; color: #0f172a;">
          <div style="font-size: 15px; line-height: 1.3; font-weight: 700; padding-bottom: 6px;">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="color: #0f172a; text-decoration: none;">${escapeHtml(displayTitle)}</a>
          </div>
          <div style="font-size: 13px; color: #475569; padding-bottom: 10px;">
            ${escapeHtml(description)}
          </div>
          <div style="font-size: 12px; color: #334155; padding-bottom: 10px;">
            ${authorLink} &nbsp;|&nbsp;
            ${escapeHtml(formatDate(item.publish_date || item.update_date || item.first_seen_at || item.updated_at))} &nbsp;|&nbsp;
            ${escapeHtml(item.price || "-")}
          </div>
          ${tags.length ? `
            <div>
              ${tags
                .map(
                  (tag) =>
                    `<span style="display: inline-block; margin: 0 6px 6px 0; padding: 3px 8px; border: 1px solid #bae6fd; border-radius: 999px; font-size: 10px; font-family: Arial, sans-serif; color: #0369a1; background: #f0f9ff;">${escapeHtml(tag)}</span>`
                )
                .join("")}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");

  const emptyState = `
    <div style="padding: 18px; border: 1px dashed #cbd5e1; border-radius: 10px; background: #ffffff; font-family: Arial, sans-serif; color: #334155; font-size: 14px;">
      No items matched this month with your current filters.
    </div>
  `;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(preference.title)}</title>
    <style>
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      @media screen and (max-width: 1100px) {
        .cards-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media screen and (max-width: 640px) {
        .cards-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body style="margin:0; padding:24px 12px; background:#f1f5f9;">
    <div style="max-width:1200px; margin:0 auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
      <div style="padding:20px 18px 12px 18px; font-family: Arial, sans-serif; color:#0f172a;">
        <h1 style="margin:0; font-size:30px; line-height:1.2;">${escapeHtml(preference.title)}</h1>
        <p style="margin:8px 0 0 0; color:#475569; font-size:13px;">Fresh items from the last 30 days, matched to your interests.</p>
      </div>
      <div style="padding:0 18px 18px 18px;">
        <div class="cards-grid">
          ${cardsHtml || emptyState}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function prepareNewsletterPreview(items, preference = {}, now = new Date()) {
  const filtered = filterNewsletterItems(items, preference, now);
  const html = buildNewsletterHtml(filtered, preference);

  return {
    items: filtered,
    html,
  };
}
