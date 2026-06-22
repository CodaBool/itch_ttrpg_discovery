export default function FilterPill({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition",
        active
          ? "border-amber-400 bg-amber-300/20 text-amber-100"
          : "border-white/20 bg-white/5 text-slate-200 hover:border-amber-200/40 hover:text-amber-100",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
