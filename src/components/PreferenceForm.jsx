function getInterestPhrase(level) {
  switch (Number(level) || 0) {
    case 0:
      return "Don't show me this";
    case 1:
      return "Show me if extremely popular";
    case 2:
      return "Show me if very popular";
    case 3:
      return "Show me if it's popular";
    case 4:
      return "Show me if someone likes it";
    case 5:
      return "Show me everything";
    default:
      return "if it's popular";
  }
}

function themeStyles(theme) {
  if (theme === "orange") {
    return {
      accentClass: "accent-amber-300",
      valueClass: "text-amber-100",
      borderClass: "border-amber-200/45",
      bgClass: "bg-amber-300/10",
      textClass: "text-amber-100",
    };
  }

  return {
    accentClass: "accent-cyan-300",
    valueClass: "text-cyan-100",
    borderClass: "border-cyan-200/45",
    bgClass: "bg-cyan-300/10",
    textClass: "text-cyan-100",
  };
}

export default function PreferenceForm({
  systems = [],
  systemScores = {},
  onSystemScoreChange,
  focusedSystemKey = "",
  onSystemFocusToggle,
  englishOnly = true,
  onEnglishOnlyChange,
  majorAwards = true,
  onMajorAwardsChange,
  addGameAssets = true,
  onAddGameAssetsChange,
  addToolsMiscGameMods = true,
  onAddToolsMiscGameModsChange,
  includeNewsletterExtras = false,
  theme = "blue",
}) {
  const styles = themeStyles(theme);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">System Interest</p>
        <div className="grid gap-3 md:grid-cols-2">
          {systems.map((system) => {
            const isFocused = focusedSystemKey === system.key;
            const hasFocusedOther = Boolean(focusedSystemKey) && !isFocused;

            return (
            <div
              key={system.key}
              className={[
                "rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-200 transition",
                isFocused ? "border-amber-300/85" : "",
                hasFocusedOther ? "opacity-50" : "opacity-100",
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 md:flex md:items-center md:gap-2">
                  <button
                    type="button"
                    onClick={() => onSystemFocusToggle?.(system.key)}
                    className={[
                      "max-w-full cursor-pointer truncate text-left font-semibold uppercase tracking-[0.1em] transition md:shrink-0",
                      isFocused ? "text-amber-100" : "text-slate-200 hover:text-amber-100",
                    ].join(" ")}
                  >
                    {system.label}
                  </button>
                  <p className="mt-1 line-clamp-2 text-[10px] uppercase tracking-[0.08em] text-slate-400 md:mt-0 md:line-clamp-1 md:truncate">{getInterestPhrase(systemScores[system.key] ?? 0)}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.1em] ${styles.valueClass}`}>{systemScores[system.key] ?? 0}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={systemScores[system.key] ?? 0}
                onChange={(event) => onSystemScoreChange?.(system.key, event.target.value)}
                className={`w-full ${styles.accentClass}`}
              />
            </div>
          );})}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={englishOnly}
            onChange={(event) => onEnglishOnlyChange?.(event.target.checked)}
            className={`h-4 w-4 ${styles.accentClass}`}
          />
          <span className="font-semibold uppercase tracking-[0.12em]">English only</span>
        </label>

        {includeNewsletterExtras ? (
          <>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={majorAwards}
                onChange={(event) => onMajorAwardsChange?.(event.target.checked)}
                className={`h-4 w-4 ${styles.accentClass}`}
              />
              <span className="font-semibold uppercase tracking-[0.12em]">Add RPG Award Releases</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={addGameAssets}
                onChange={(event) => onAddGameAssetsChange?.(event.target.checked)}
                className={`h-4 w-4 ${styles.accentClass}`}
              />
              <span className="font-semibold uppercase tracking-[0.12em]">Add Game Assets</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={addToolsMiscGameMods}
                onChange={(event) => onAddToolsMiscGameModsChange?.(event.target.checked)}
                className={`h-4 w-4 ${styles.accentClass}`}
              />
              <span className="font-semibold uppercase tracking-[0.12em]">Add Tools, Misc, Game-Mods</span>
            </label>
          </>
        ) : null}
      </div>

    </div>
  );
}
