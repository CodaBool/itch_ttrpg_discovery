const DRAFT_STORAGE_KEY = "itch-feed:newsletter-draft";

function normalizeSystems(defaultSystems, incomingSystems) {
  const source = incomingSystems && typeof incomingSystems === "object" ? incomingSystems : {};

  return Object.fromEntries(
    Object.keys(defaultSystems).map((key) => {
      const raw = Number(source[key]);
      const fallback = defaultSystems[key] ?? 4;
      const clamped = Number.isFinite(raw) ? Math.min(5, Math.max(0, Math.round(raw))) : fallback;
      return [key, clamped];
    })
  );
}

export function makeDefaultSystemScores(systems, defaultScore = 4) {
  return Object.fromEntries(systems.map((system) => [system.key, defaultScore]));
}

export function loadPreferenceDraft(defaultSystems) {
  const fallback = {
    email: "",
    systems: defaultSystems,
    majorAwards: true,
    englishOnly: true,
    excludeAiAssisted: true,
    addGameAssets: true,
    addToolsMiscGameMods: true,
    excludedCreators: [],
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      email: String(parsed.email || "").trim(),
      systems: normalizeSystems(defaultSystems, parsed.systems),
      majorAwards: parsed.majorAwards !== false,
      englishOnly: parsed.englishOnly !== false,
      excludeAiAssisted: parsed.excludeAiAssisted !== false,
      addGameAssets: parsed.addGameAssets !== false,
      addToolsMiscGameMods: parsed.addToolsMiscGameMods !== false,
      excludedCreators: Array.isArray(parsed.excludedCreators)
        ? parsed.excludedCreators.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
        : [],
    };
  } catch {
    return fallback;
  }
}

export function savePreferenceDraft(payload) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
}
