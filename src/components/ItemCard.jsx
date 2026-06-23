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

export default function ItemCard({
  item,
  interactionMode = "none",
  onToolAction,
  actionState = "idle",
  shake = false,
}) {
  const sourceChips = item.source.slice(0, 4);
  const toolModeEnabled = interactionMode !== "none";
  const isFree = isFreePrice(item.price);

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
        "group feed-item relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.9)] backdrop-blur-sm",
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

      <div className="mb-3 aspect-[315/250] overflow-hidden rounded-xl border border-white/10 bg-black">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : null}
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-slate-50">{item.title}</h2>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
            isFree
              ? "border border-orange-200/60 bg-orange-300/20 text-orange-100"
              : "border border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
          ].join(" ")}
        >
          {isFree ? "FREE" : item.price || "-"}
        </span>
      </div>

      <p className="line-clamp-4 text-sm leading-relaxed text-slate-300">{item.description || "No description available."}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {sourceChips.map((s) => (
          <span
            key={`${s.category_slug}-${s.term}`}
            className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200"
          >
            {formatSourceTerm(s.term)}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>{formatDate(item.publish_date)}</span>
        {item.author_url ? (
          <a
            href={item.author_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            onAuxClick={(event) => event.stopPropagation()}
            className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/40"
          >
            {formatAuthorName(item.author)}
          </a>
        ) : (
          <span>{formatAuthorName(item.author)}</span>
        )}
      </div>
    </article>
  );
}
