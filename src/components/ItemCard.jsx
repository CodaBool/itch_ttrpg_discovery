function formatDate(value) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

function formatSourceTerm(term) {
  const value = (term || "").trim();
  if (!value) return "unknown";

  const normalized = value.startsWith("ttrpg+") ? value.slice("ttrpg+".length) : value;
  return normalized.replace(/-/g, " ");
}

function formatAuthorName(author) {
  const value = (author || "unknown author").trim();
  return value.replace(/-/g, " ");
}

function buildAuthorFontSizeStyle(authorName) {
  const length = String(authorName || "").length;
  if (length <= 10) return {};

  // Past 10 chars, progressively shrink text so long names can fit in the fixed button width.
  const scale = 10 / length;
  const mobileSize = 9 * scale;
  const desktopSize = 11 * scale;

  return {
    fontSize: `clamp(${mobileSize}px, ${mobileSize}px + 0.2vw, ${desktopSize}px)`,
  };
}

function openInNewTab(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function isFreePrice(price) {
  const raw = String(price || "").trim().toLowerCase();
  if (!raw) return false;

  if (raw === "free") return true;

  // Normalize common currency formatting and detect true zero values.
  const numeric = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(numeric) && numeric === 0;
}

function decodeHtmlEntities(value) {
  const raw = String(value || "");
  if (!raw || !raw.includes("&")) return raw;

  if (typeof window === "undefined") {
    return raw
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = raw;
  return textarea.value;
}

function parseRatingMetric(rawRating) {
  const value = String(rawRating || "").trim();
  if (!value) return null;

  const parts = value.split("over");
  if (parts.length !== 2) return null;

  const average = Number(parts[0]);
  const count = Number(parts[1]);

  if (!Number.isFinite(average) || !Number.isFinite(count)) return null;
  return { average, count };
}

function parseEngagementMetric(rawEngagement) {
  if (rawEngagement == null) return null;
  const value = Number(rawEngagement);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function showMetricTooltip(event, text) {
  if (!text || typeof document === "undefined") return;
  let tooltip = document.querySelector("#metric-tooltip-global");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "metric-tooltip-global";
    tooltip.className = "pointer-events-none fixed z-[9999] rounded-xl border border-white/30 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-100 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.85)]";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = text;
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY - 12}px`;
  tooltip.style.display = "block";
}

function hideMetricTooltip() {
  if (typeof document === "undefined") return;
  const tooltip = document.querySelector("#metric-tooltip-global");
  if (tooltip) tooltip.style.display = "none";
}

export default function ItemCard({
  item,
  isVipAuthor = false,
  readingMode = false,
  interactionMode = "none",
  onToolAction,
  onAuthorToolAction,
  actionState = "idle",
  shake = false,
}) {
  const sourceChips = item.source.slice(0, 4);
  const toolModeEnabled = interactionMode !== "none";
  const isFree = isFreePrice(item.price);
  const displayTitle = decodeHtmlEntities(item.title);
  const displayDescription = decodeHtmlEntities(item.description);
  const displayAuthor = formatAuthorName(item.author);
  const authorFontSizeStyle = buildAuthorFontSizeStyle(displayAuthor);
  const ratingMetric = parseRatingMetric(item.rating);
  const engagementMetric = parseEngagementMetric(item.engagement);
  const showRatingStar = Boolean(ratingMetric && ratingMetric.average >= 4);
  const showEngagementFire = item.engagement != null && engagementMetric !== null && engagementMetric > 0;
  const showNoAiBadge = String(item.ai || "").trim().toLowerCase() === "no ai";
  const ratingCount = ratingMetric ? ratingMetric.count : null;
  const shouldAnimateRating = Boolean(ratingCount != null && ratingCount > 5);
  const shouldAnimateEngagement = Boolean(engagementMetric != null && engagementMetric > 6);
  const ratingTooltip = ratingMetric
    ? `${ratingMetric.average.toFixed(2)} average rating across ${ratingMetric.count} ratings`
    : "";
  const engagementTooltip = `${engagementMetric ?? 0} comments or threads`;
  const hoverRevealClass = readingMode
    ? "opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    : "opacity-100";
  const priceTextRevealClass = readingMode
    ? "opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    : "opacity-100";

  return (
    <article
      role={toolModeEnabled ? "button" : "link"}
      tabIndex={0}
      onClick={() => {
        if (toolModeEnabled) {
          onToolAction?.(item);
          return;
        }

        openInNewTab(item.url);
      }}
      onAuxClick={(event) => {
        if (toolModeEnabled) {
          event.preventDefault();
          return;
        }

        if (event.button === 1) {
          event.preventDefault();
          openInNewTab(item.url);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (toolModeEnabled) {
            onToolAction?.(item);
            return;
          }

          openInNewTab(item.url);
        }
      }}
      className={[
        "group feed-item relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/55 p-3 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm",
        actionState === "stamp" ? "item-stamp-out" : "",
        actionState === "cut" ? "item-cut-out" : "",
        shake ? "item-shake" : "",
      ].join(" ")}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />

      {interactionMode === "hide-item" && actionState !== "stamp" ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition duration-150 group-hover:opacity-100">
          <span className="rounded-xl border border-red-100/70 bg-red-700/50 px-8 py-4 text-3xl font-black uppercase tracking-[0.24em] text-red-100 shadow-[0_14px_34px_rgba(0,0,0,0.6)]">
            mark seen
          </span>
        </div>
      ) : null}

      {actionState === "stamp" ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="stamp-seen rounded-xl border border-red-100/80 bg-red-700/55 px-8 py-4 text-3xl font-black uppercase tracking-[0.24em] text-red-100 shadow-[0_14px_34px_rgba(0,0,0,0.6)]">
            seen
          </span>
        </div>
      ) : null}

      {actionState === "cut" ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <span className="cut-line absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-rose-200/90" />
        </div>
      ) : null}

      <div className="mb-2.5 aspect-[451/338] overflow-hidden rounded-lg border border-white/10 bg-black">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={displayTitle}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

<div className="mb-2.5 flex min-w-0 items-start justify-between gap-2">
  <h2 className="min-w-0 flex-1 break-words line-clamp-2 text-base font-semibold leading-tight text-slate-50">
    {displayTitle}
  </h2>

  <span
    className={[
      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
      isFree
        ? "border border-orange-200/60 bg-orange-300/20 text-orange-100"
        : "border border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
    ].join(" ")}
  >
    <span className={priceTextRevealClass}>{isFree ? "FREE" : item.price || "-"}</span>
  </span>
</div>

      <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">{displayDescription || "No description available."}</p>

      <div className={`mt-2.5 flex flex-wrap gap-1.5 ${hoverRevealClass}`}>
        {sourceChips.map((s) => (
          <span
            key={`${s.category_slug}-${s.term}`}
            className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-200"
          >
            {formatSourceTerm(s.term)}
          </span>
        ))}
        {showNoAiBadge ? (
          <span className="rounded-full border border-cyan-200/35 bg-cyan-300/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
            no ai
          </span>
        ) : null}
      </div>

<div className="mt-auto flex min-w-0 items-center justify-between gap-2 pt-1.5 text-[9px] text-slate-400 md:text-[11px]">
  <div className="flex min-w-0 items-center gap-4">
          <span className={hoverRevealClass}>{formatDate(item.publish_date)}</span>
          <div className="flex items-center gap-4">
            {showRatingStar ? (
              <span
                className="group/metric relative inline-flex h-4 w-4 items-center justify-center"
                onMouseEnter={(event) => showMetricTooltip(event, ratingTooltip)}
                onMouseMove={(event) => showMetricTooltip(event, ratingTooltip)}
                onMouseLeave={hideMetricTooltip}
              >
                <span className="pointer-events-none absolute right-full top-1/2 mr-px -translate-x-0.5 -translate-y-1/2 text-[11px] font-semibold text-red-300 opacity-100 transition-all duration-200 md:opacity-0 md:group-hover:translate-x-0 md:group-hover:opacity-100">
                  {ratingCount}
                </span>
                <span className="inline-flex h-4 w-4 items-center justify-center text-red-400 opacity-100 transition-all duration-200 md:opacity-40 md:group-hover:translate-x-0.5 md:group-hover:opacity-100" aria-label={ratingTooltip}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 -0.5 33 33"
                    className={`h-4 w-4 ${shouldAnimateRating ? "metric-icon-dramatic" : ""}`}
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      fillRule="evenodd"
                      d="m27 32-10-6-11 6 3-12-9-8 12-1 4-11 5 11 12 1-8 8z"
                    />
                  </svg>
                </span>
              </span>
            ) : null}
            {showEngagementFire ? (
              <span
                className="group/metric relative inline-flex h-4 w-4 items-center justify-center"
                onMouseEnter={(event) => showMetricTooltip(event, engagementTooltip)}
                onMouseMove={(event) => showMetricTooltip(event, engagementTooltip)}
                onMouseLeave={hideMetricTooltip}
              >
                <span className="pointer-events-none absolute right-full top-1/2 mr-px -translate-x-0.5 -translate-y-1/2 text-[11px] font-semibold text-amber-300 opacity-100 transition-all duration-200 md:opacity-0 md:group-hover:translate-x-0 md:group-hover:opacity-100">
                  {engagementMetric}
                </span>
                <span className="inline-flex h-4 w-4 items-center justify-center opacity-100 transition-all duration-200 md:opacity-40 md:group-hover:translate-x-0.5 md:group-hover:opacity-100" aria-label={engagementTooltip}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="xMidYMid"
                    viewBox="-33 0 255 255"
                    className={`h-4 w-4 ${shouldAnimateEngagement ? "metric-icon-dramatic" : ""}`}
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="engagement-fire-gradient" x1="94.1" x2="94.1" y1="255" y2=".2" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#ff4c0d" />
                        <stop offset="1" stopColor="#fc9502" />
                      </linearGradient>
                    </defs>
                    <g fillRule="evenodd">
                      <path d="M188 165a94 94 0 0 1-188-4c0-7 0-20 10-43q9-20 12-30c1-4 3-11 10 0 4 6 4 16 4 16s14-11 24-32c14-31 3-49-1-62-1-5-2-13 7-9 9 3 34 21 47 39 18 26 25 51 25 51s6-8 8-15c2-9 2-17 10-8 7 9 18 25 24 41 11 28 8 56 8 56" style={{ fill: "url(#engagement-fire-gradient)" }} />
                      <path d="M94 255c-36 0-65-29-65-65 0-22 9-35 27-53q19-18 27-35c1-2 3-12 11 0q8 11 15 26c7 16 9 31 9 31s7-4 12-15c2-4 5-17 14-4 6 10 15 27 15 50 0 36-29 65-65 65" style={{ fill: "#fc9502" }} />
                      <path d="M95 184c9 0 9 17 21 40 8 15-4 31-21 31s-26-14-26-31 17-40 26-40" style={{ fill: "#fce202" }} />
                    </g>
                  </svg>
                </span>
              </span>
            ) : null}
          </div>
        </div>
        {item.author_url ? (
          <a
            href={item.author_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (toolModeEnabled && interactionMode === "ban") {
                event.preventDefault();
                event.stopPropagation();
                onAuthorToolAction?.(item);
                return;
              }
              event.stopPropagation();
            }}
            onAuxClick={(event) => {
              if (toolModeEnabled && interactionMode === "ban") {
                event.preventDefault();
                event.stopPropagation();
                onAuthorToolAction?.(item);
                return;
              }
              event.stopPropagation();
            }}
            style={authorFontSizeStyle}
            className={`min-w-0 max-w-[50%] truncate inline-flex items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-100 transition hover:border-white/40 md:text-[11px] ${hoverRevealClass}`}
          >
            {isVipAuthor ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                xmlSpace="preserve"
                viewBox="0 0 220 220"
                className="h-3 w-3 shrink-0 text-amber-300"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M220 99a23 23 0 1 0-40 15l-24 22-31-63 18-21-33-39-33 39 17 20-30 64-24-22q6-6 6-15a23 23 0 1 0-26 23l7 85h166l7-85q18-4 20-23"
                />
              </svg>
            ) : null}
            {displayAuthor}
          </a>
        ) : (
          <span style={authorFontSizeStyle} className={hoverRevealClass}>{displayAuthor}</span>
        )}
      </div>
    </article>
  );
}
