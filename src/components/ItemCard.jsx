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

export default function ItemCard({ item }) {
  const sourceChips = item.source.slice(0, 4);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.9)] backdrop-blur-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent opacity-0 transition group-hover:opacity-100" />

      {item.image_url ? (
        <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="h-44 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}

      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-slate-50">{item.title}</h2>
        <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
          {item.price || "free"}
        </span>
      </div>

      <p className="line-clamp-4 text-sm leading-relaxed text-slate-300">{item.description || "No description available."}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {sourceChips.map((s) => (
          <span
            key={`${s.category_slug}-${s.term}`}
            className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-200"
          >
            {s.category_slug}:{s.term}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>{formatDate(item.publish_date)}</span>
        <span>{item.author || "unknown author"}</span>
      </div>

      <div className="mt-4 flex gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-amber-300/60 bg-amber-300/90 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-amber-200"
        >
          Open on Itch
        </a>
        {item.author_url ? (
          <a
            href={item.author_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/40"
          >
            Author
          </a>
        ) : null}
      </div>
    </article>
  );
}
