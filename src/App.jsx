import { useEffect, useMemo, useState } from "react";
import FilterPill from "./components/FilterPill";
import ItemCard from "./components/ItemCard";

const CATEGORY_OPTIONS = [
    { slug: "tools", label: "Tools" },
    { slug: "game-assets", label: "Assets" },
    { slug: "physical-games", label: "Games" },
];

const CATEGORY_ALIAS_BY_SLUG = {
    tools: ["tools", "misc", "game-mods"],
};

// Keep in sync with worker/src/index.js
const PAIR_TAGS = [
  "horror",
  "body-horror",
  "generation",
  "generated",
  "generator",
  "tool",
  "mystery",
  "investigation",
  "comedy",
  "survival-horror",
  "pbta",
  "forged-in-the-dark",
  "sci-fi",
];

const SOLO_TAGS = [
  "zine",
  "one-page",
  "one-shot",
  "rules-lite",
  "rules-light",
  "supplement",
  "tabletop",
  "fanzine",
  "micro-rpg",
  "ttrpg",
  "osr",
  "liminal-horror",
  "mothership",
  "mothership-rpg",
  "panic-engine",
  "mork-borg",
  "delta-green",
  "call-of-cthulhu",
  "triangle-agency",
  "mausritter",
  "cairn",
  "into-the-odd",
  "fist",
];

const SYSTEM_DEFINITIONS = [
    { key: "liminal-horror", label: "Liminal Horror", tags: ["liminal-horror"] },
    { key: "mothership", label: "Mothership", tags: ["mothership", "mothership-rpg", "panic-engine"] },
    { key: "mork-borg", label: "Mork Borg", tags: ["mork-borg"] },
    { key: "delta-green", label: "Delta Green", tags: ["delta-green"] },
    { key: "call-of-cthulhu", label: "Call of Cthulhu", tags: ["call-of-cthulhu"] },
    { key: "triangle-agency", label: "Triangle Agency", tags: ["triangle-agency"] },
    { key: "mausritter", label: "Mausritter", tags: ["mausritter"] },
    { key: "cairn", label: "Cairn", tags: ["cairn"] },
    { key: "into-the-odd", label: "Into the Odd", tags: ["into-the-odd"] },
    { key: "fist", label: "FIST", tags: ["fist"] },
];

const SYSTEM_TAGS = SYSTEM_DEFINITIONS.map((system) => system.key);
const SYSTEM_FILTERS = SYSTEM_DEFINITIONS.map(({ key, label }) => ({ key, label }));

const HIDDEN_ALIAS_TAGS = ["mothership-rpg", "panic-engine"];

const ALL_TAGS = [...new Set([...PAIR_TAGS, ...SOLO_TAGS])];
const NON_SYSTEM_TAGS = ALL_TAGS.filter(
    (tag) => !SYSTEM_TAGS.includes(tag) && !HIDDEN_ALIAS_TAGS.includes(tag)
);

const STORAGE_KEYS = {
    category: "itch-feed:selected-category",
    system: "itch-feed:selected-system",
    tags: "itch-feed:selected-tags",
    hiddenUrls: "itch-feed:hidden-urls",
    blockedAuthors: "itch-feed:blocked-authors",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://itch-ttrpg-discovery.codabool.workers.dev";

const SYSTEM_TAGS_BY_KEY = Object.fromEntries(
    SYSTEM_DEFINITIONS.map((system) => [system.key, system.tags])
);

function loadStoredArray(key, fallback, allowedValues) {
    if (typeof window === "undefined") return fallback;

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return fallback;

        const allowed = new Set(allowedValues);
        const cleaned = parsed.filter((value) => allowed.has(value));
        return cleaned.length ? cleaned : fallback;
    } catch {
        return fallback;
    }
}

function loadStoredCategoryValue() {
    const allowed = CATEGORY_OPTIONS.map((option) => option.slug);
    const normalizedAliases = {
        misc: "tools",
        "game-mods": "tools",
    };

    if (typeof window === "undefined") return "physical-games";

    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.category);
        if (!raw) return "physical-games";
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "string") return "physical-games";

        const normalized = normalizedAliases[parsed] || parsed;
        return allowed.includes(normalized) ? normalized : "physical-games";
    } catch {
        return "physical-games";
    }
}

function loadStoredSystemValue() {
    if (typeof window === "undefined") return "";

    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.system);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "string") return "";

        // Backward-compat: old stored panic-engine selection now maps to mothership.
        const normalized = ["panic-engine", "mothership-rpg"].includes(parsed)
            ? "mothership"
            : parsed;
        const allowed = SYSTEM_FILTERS.map((system) => system.key);
        return allowed.includes(normalized) ? normalized : "";
    } catch {
        return "";
    }
}

function loadStoredStringArray(key) {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((value) => String(value || "").trim())
            .filter(Boolean);
    } catch {
        return [];
    }
}

function toggleValue(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function toggleSystemSelection(current, next) {
    return current === next ? "" : next;
}

function getSystemMatchTags(systemKey) {
    return SYSTEM_TAGS_BY_KEY[systemKey] || [systemKey];
}

function readSourceTags(source) {
    if (!source || typeof source !== "object") return [];

    if (Array.isArray(source.tags)) {
        return source.tags.map((tag) => String(tag).toLowerCase());
    }

    if (typeof source.term === "string") {
        return source.term
            .split("+")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean);
    }

    return [];
}

function hasCategory(item, slug) {
    const expanded = CATEGORY_ALIAS_BY_SLUG[slug] || [slug];
    const wanted = new Set(expanded);
    return item.source.some((source) => wanted.has(source.category_slug));
}

function itemTagSet(item) {
    const tags = new Set();
    item.source.forEach((source) => {
        readSourceTags(source).forEach((tag) => tags.add(tag));
    });
    return tags;
}

function parseItemDate(item) {
    const raw = item.publish_date || item.update_date || item.first_seen_at || item.updated_at || "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function normalizeAuthorKey(author) {
    return String(author || "").trim().toLowerCase();
}

function getTimeBucket(item, now = new Date()) {
    const d = parseItemDate(item);
    if (!d) return "over-365";

    const DAY_MS = 24 * 60 * 60 * 1000;
    const ageMs = now.getTime() - d.getTime();
    const ageDays = ageMs / DAY_MS;

    if (ageDays <= 30) return "last-30";
    if (ageDays <= 365) return "last-365";
    return "over-365";
}

const BUCKET_META = {
    "last-30": { label: "Last 30 Days" },
    "last-365": { label: "Last 365 Days" },
    "over-365": { label: "Over 365 Days" },
};

const BUCKET_ORDER = ["last-30", "last-365", "over-365"];

export default function App() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(() =>
        loadStoredCategoryValue()
    );
    const [selectedSystem, setSelectedSystem] = useState(() =>
        loadStoredSystemValue()
    );
    const [selectedTags, setSelectedTags] = useState(() =>
        loadStoredArray(STORAGE_KEYS.tags, NON_SYSTEM_TAGS, NON_SYSTEM_TAGS)
    );
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [hiddenUrls, setHiddenUrls] = useState(() => loadStoredStringArray(STORAGE_KEYS.hiddenUrls));
    const [blockedAuthors, setBlockedAuthors] = useState(() => loadStoredStringArray(STORAGE_KEYS.blockedAuthors));
    const [interactionMode, setInteractionMode] = useState("none");
    const [itemActionState, setItemActionState] = useState({});
    const [isDesktopTools, setIsDesktopTools] = useState(false);
    const [showBeyondYear, setShowBeyondYear] = useState(false);

    const availableSystems = useMemo(() => {
        const available = new Set();

        items.forEach((item) => {
            if (!hasCategory(item, selectedCategory)) return;

            const tags = itemTagSet(item);

            SYSTEM_FILTERS.forEach((system) => {
                const matchTags = getSystemMatchTags(system.key);
                if (matchTags.some((tag) => tags.has(tag))) {
                    available.add(system.key);
                }
            });
        });

        return available;
    }, [items, selectedCategory]);

    const visibleSystemFilters = useMemo(() => {
        return SYSTEM_FILTERS.filter(
            (system) => system.key === selectedSystem || availableSystems.has(system.key)
        );
    }, [availableSystems, selectedSystem]);

    useEffect(() => {
        // Cleanup old localStorage values from earlier UI versions.
        setSelectedTags((prev) => prev.filter((tag) => !HIDDEN_ALIAS_TAGS.includes(tag)));
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.category, JSON.stringify(selectedCategory));
    }, [selectedCategory]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.system, JSON.stringify(selectedSystem));
    }, [selectedSystem]);

    useEffect(() => {
        if (!selectedSystem) return;
        if (availableSystems.has(selectedSystem)) return;
        setSelectedSystem("");
    }, [selectedSystem, availableSystems]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(selectedTags));
    }, [selectedTags]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.hiddenUrls, JSON.stringify(hiddenUrls));
    }, [hiddenUrls]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.blockedAuthors, JSON.stringify(blockedAuthors));
    }, [blockedAuthors]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const media = window.matchMedia("(min-width: 768px) and (pointer: fine)");
        const apply = () => {
            const enabled = media.matches;
            setIsDesktopTools(enabled);
            if (!enabled) setInteractionMode("none");
        };

        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const PAGE_SIZE = 5000;
        const MAX_PAGES = 200;

        async function load() {
            setLoading(true);
            setError("");

            try {
                const q = search.trim();
                const collected = [];

                let offset = 0;
                let hasMore = true;
                let page = 0;

                while (hasMore && page < MAX_PAGES) {
                    const params = new URLSearchParams({
                        limit: String(PAGE_SIZE),
                        offset: String(offset),
                    });
                    if (q) params.set("q", q);

                    const response = await fetch(`${API_BASE}/api/items?${params.toString()}`, {
                        signal: controller.signal,
                    });

                    if (!response.ok) {
                        throw new Error(`API request failed with status ${response.status}`);
                    }

                    const payload = await response.json();
                    const pageItems = Array.isArray(payload.items) ? payload.items : [];
                    collected.push(...pageItems);

                    const pagination = payload.pagination || {};
                    hasMore = Boolean(pagination.has_more);
                    offset = Number.isFinite(Number(pagination.next_offset))
                        ? Number(pagination.next_offset)
                        : offset + PAGE_SIZE;
                    page += 1;
                }

                setItems(collected);
            } catch (err) {
                if (err.name !== "AbortError") {
                    setError(err.message || "Unable to load feed.");
                }
            } finally {
                setLoading(false);
            }
        }

        load();
        return () => controller.abort();
    }, [search]);

    const hiddenUrlSet = useMemo(() => new Set(hiddenUrls), [hiddenUrls]);
    const blockedAuthorSet = useMemo(() => new Set(blockedAuthors), [blockedAuthors]);

    const visibleItems = useMemo(() => {
        return items.filter((item) => {
            const categoryMatch = hasCategory(item, selectedCategory);

            if (!categoryMatch) return false;

            if (hiddenUrlSet.has(item.url)) return false;

            const authorKey = normalizeAuthorKey(item.author);
            if (authorKey && blockedAuthorSet.has(authorKey)) return false;

            const tags = itemTagSet(item);

            if (selectedSystem) {
                const matchTags = getSystemMatchTags(selectedSystem);
                return matchTags.some((tag) => tags.has(tag));
            }

            if (selectedTags.length === 0) return true;
            return selectedTags.some((tag) => tags.has(tag));
        });
    }, [items, selectedCategory, selectedSystem, selectedTags, hiddenUrlSet, blockedAuthorSet]);

    function runItemAction(item, mode) {
        const animationType = mode === "block-author" ? "cut" : "stamp";
        const timeoutMs = animationType === "cut" ? 430 : 380;

        setItemActionState((prev) => ({ ...prev, [item.url]: animationType }));

        window.setTimeout(() => {
            if (mode === "hide-item") {
                setHiddenUrls((prev) => (prev.includes(item.url) ? prev : [...prev, item.url]));
            }

            if (mode === "block-author") {
                const authorKey = normalizeAuthorKey(item.author);
                if (authorKey) {
                    setBlockedAuthors((prev) => (prev.includes(authorKey) ? prev : [...prev, authorKey]));
                }
            }

            setItemActionState((prev) => {
                const next = { ...prev };
                delete next[item.url];
                return next;
            });
        }, timeoutMs);
    }

    function handleItemToolAction(item) {
        if (!isDesktopTools || interactionMode === "none") return;

        if (interactionMode === "hide-item") {
            runItemAction(item, "hide-item");
            return;
        }

        if (interactionMode === "block-author") {
            const authorKey = normalizeAuthorKey(item.author);
            if (!authorKey) return;
            runItemAction(item, "block-author");
        }
    }

    function clearHidden() {
        setHiddenUrls([]);
    }

    function clearBlockedAuthors() {
        setBlockedAuthors([]);
    }

    const stats = useMemo(() => {
        return {
            total: visibleItems.length,
            withImages: visibleItems.filter((i) => Boolean(i.image_url)).length,
            uniqueAuthors: new Set(visibleItems.map((i) => i.author).filter(Boolean)).size,
        };
    }, [visibleItems]);

    const groupedBuckets = useMemo(() => {
        const now = new Date();
        const sorted = [...visibleItems].sort((a, b) => {
            const da = parseItemDate(a);
            const db = parseItemDate(b);
            const ta = da ? da.getTime() : 0;
            const tb = db ? db.getTime() : 0;
            return tb - ta;
        });

        const groups = {
            "last-30": [],
            "last-365": [],
            "over-365": [],
        };

        sorted.forEach((item) => {
            const bucket = getTimeBucket(item, now);
            groups[bucket].push(item);
        });

        return BUCKET_ORDER.filter((key) => groups[key].length > 0).map((key) => ({
            key,
            label: BUCKET_META[key].label,
            items: groups[key],
        }));
    }, [visibleItems]);

    const showTimelineLayout = groupedBuckets.length > 1;
    const singleBucket = groupedBuckets.length === 1 ? groupedBuckets[0] : null;

    useEffect(() => {
        setShowBeyondYear(false);
    }, [selectedCategory, selectedSystem, selectedTags, search]);

    return (
        <main
            className={[
                "min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.2),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(14,165,233,.18),transparent_40%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-14 pt-8 text-slate-100 md:px-8",
                isDesktopTools && interactionMode === "block-author" ? "tool-mode-block" : "",
                isDesktopTools && interactionMode === "hide-item" ? "tool-mode-stamp" : "",
            ].join(" ")}
        >
            <section className="mx-auto w-full max-w-7xl">

                <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-2 backdrop-blur-sm md:p-5">
                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Category</p>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORY_OPTIONS.map((category) => (
                                <FilterPill
                                    key={category.slug}
                                    label={category.label}
                                    active={selectedCategory === category.slug}
                                    onClick={() => setSelectedCategory(category.slug)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Systems</p>
                        <div className="flex flex-wrap gap-2">
                            {visibleSystemFilters.map((system) => (
                                <FilterPill
                                    key={system.key}
                                    label={system.label}
                                    active={selectedSystem === system.key}
                                    onClick={() => setSelectedSystem((prev) => toggleSystemSelection(prev, system.key))}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-white/20"
                            aria-expanded={isAdvancedOpen}
                            aria-controls="advanced-filters"
                            onClick={() => setIsAdvancedOpen((prev) => !prev)}
                        >
                            <span>Advanced</span>
                            <svg
                                viewBox="0 0 20 20"
                                fill="none"
                                aria-hidden="true"
                                className={[
                                    "h-4 w-4 text-slate-300 transition-transform duration-200",
                                    isAdvancedOpen ? "rotate-180" : "rotate-0",
                                ].join(" ")}
                            >
                                <path
                                    d="M5 7.5L10 12.5L15 7.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>

                        <div id="advanced-filters" className={isAdvancedOpen ? "mt-3 space-y-4" : "hidden"}>
                            <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Search</label>
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search title or description"
                                    className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-orange-300/60"
                                />
                            </div>

                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Tags</p>
                            <div className="flex flex-wrap gap-2">
                                {NON_SYSTEM_TAGS.map((tag) => (
                                    <FilterPill
                                        key={tag}
                                        label={tag}
                                        active={selectedTags.includes(tag)}
                                        onClick={() => setSelectedTags((prev) => toggleValue(prev, tag))}
                                    />
                                ))}
                            </div>

                            {isDesktopTools ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Seen Items</p>
                                    <div className="flex items-center justify-between gap-3 text-xs text-slate-200">
                                        <span>{hiddenUrls.length} hidden</span>
                                        <button
                                            type="button"
                                            onClick={clearHidden}
                                            className="rounded border border-white/20 px-2 py-1 uppercase tracking-[0.12em] text-slate-200 hover:border-white/40"
                                        >
                                            clear
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {isDesktopTools ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Blocked Creators</p>
                                    <div className="flex items-center justify-between gap-3 text-xs text-slate-200">
                                        <span>{blockedAuthors.length} blocked</span>
                                        <button
                                            type="button"
                                            onClick={clearBlockedAuthors}
                                            className="rounded border border-white/20 px-2 py-1 uppercase tracking-[0.12em] text-slate-200 hover:border-white/40"
                                        >
                                            clear
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>

                {isDesktopTools ? (
                    <div className="fixed left-[min(calc((100vw+80rem)/2+1rem),calc(100vw-5.5rem))] top-1/2 z-50 flex -translate-y-1/2 flex-col gap-3">
                        <div className="group relative">
                            <button
                                type="button"
                                onClick={() => setInteractionMode((prev) => (prev === "block-author" ? "none" : "block-author"))}
                                className={[
                                    "rounded-xl border p-2 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.85)] backdrop-blur-sm transition",
                                    interactionMode === "block-author"
                                        ? "border-rose-300/80 bg-rose-300/20"
                                        : "border-white/20 bg-slate-950/70 hover:border-rose-200/50",
                                ].join(" ")}
                                aria-label="no longer show this creator"
                            >
                                <img src="/scissors_closed.webp" alt="Block creator mode" className="h-10 w-10 object-contain" />
                            </button>
                            <span className="pointer-events-none absolute left-full top-1/2 ml-3 w-max -translate-y-1/2 rounded-md border border-white/15 bg-slate-900/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100 opacity-0 transition group-hover:opacity-100">
                                no longer show this creator
                            </span>
                        </div>

                        <div className="group relative">
                            <button
                                type="button"
                                onClick={() => setInteractionMode((prev) => (prev === "hide-item" ? "none" : "hide-item"))}
                                className={[
                                    "rounded-xl border p-2 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.85)] backdrop-blur-sm transition",
                                    interactionMode === "hide-item"
                                        ? "border-red-300/80 bg-red-300/20"
                                        : "border-white/20 bg-slate-950/70 hover:border-red-200/50",
                                ].join(" ")}
                                aria-label="mark an item as seen, so it won't be shown again"
                            >
                                <img src="/stamp.webp" alt="Mark seen mode" className="h-10 w-10 object-contain" />
                            </button>
                            <span className="pointer-events-none absolute left-full top-1/2 ml-3 w-max -translate-y-1/2 rounded-md border border-white/15 bg-slate-900/95 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100 opacity-0 transition group-hover:opacity-100">
                                mark an item as seen, so it won't be shown again
                            </span>
                        </div>
                    </div>
                ) : null}

                {loading ? <p className="mt-6 text-sm text-slate-300">Loading feed entries...</p> : null}
                {error ? <p className="mt-6 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}

                {!loading && !error ? (
                    showTimelineLayout ? (
                        <section className="mt-6 space-y-8">
                            {groupedBuckets.map((group) => (
                                <section key={group.key}>
                                    <div className="mb-4">
                                        <h2 className="text-2xl font-bold tracking-tight text-amber-100 md:text-3xl">
                                            {group.label}
                                        </h2>
                                        <div className="mt-2 h-px w-full bg-gradient-to-r from-amber-300/70 via-cyan-300/20 to-transparent" />
                                    </div>

                                    {group.key === "over-365" ? (
                                        <div className="space-y-3">
                                            {showBeyondYear ? null : (
                                                <>
                                                    <p className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/90">
                                                        Data is gathered by itch's newest page. Results over a year old are limited.
                                                    </p>

                                                    <button
                                                        type="button"
                                                        onClick={() => setShowBeyondYear(true)}
                                                        className="rounded-xl border border-amber-200/50 bg-amber-300/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/80"
                                                    >
                                                        {`Show ${group.label} (${group.items.length})`}
                                                    </button>
                                                </>
                                            )}

                                            {showBeyondYear ? (
                                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                                    {group.items.map((item) => (
                                                        <ItemCard
                                                            key={item.url}
                                                            item={item}
                                                            interactionMode={isDesktopTools ? interactionMode : "none"}
                                                            onToolAction={handleItemToolAction}
                                                            actionState={itemActionState[item.url] || "idle"}
                                                            shake={isDesktopTools && interactionMode === "block-author"}
                                                        />
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                            {group.items.map((item) => (
                                                <ItemCard
                                                    key={item.url}
                                                    item={item}
                                                    interactionMode={isDesktopTools ? interactionMode : "none"}
                                                    onToolAction={handleItemToolAction}
                                                    actionState={itemActionState[item.url] || "idle"}
                                                    shake={isDesktopTools && interactionMode === "block-author"}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </section>
                    ) : (
                        singleBucket?.key === "over-365" ? (
                            <section className="mt-6 space-y-3">
                                {showBeyondYear ? null : (
                                    <>
                                        <p className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/90">
                                            Data is gathered by itch's newest page. Results over a year old are limited.
                                        </p>

                                        <button
                                            type="button"
                                            onClick={() => setShowBeyondYear(true)}
                                            className="rounded-xl border border-amber-200/50 bg-amber-300/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/80"
                                        >
                                            {`Show ${singleBucket.label} (${singleBucket.items.length})`}
                                        </button>
                                    </>
                                )}

                                {showBeyondYear ? (
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {singleBucket.items.map((item) => (
                                            <ItemCard
                                                key={item.url}
                                                item={item}
                                                interactionMode={isDesktopTools ? interactionMode : "none"}
                                                onToolAction={handleItemToolAction}
                                                actionState={itemActionState[item.url] || "idle"}
                                                shake={isDesktopTools && interactionMode === "block-author"}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        ) : (
                            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {visibleItems.length ? (
                                    visibleItems.map((item) => (
                                        <ItemCard
                                            key={item.url}
                                            item={item}
                                            interactionMode={isDesktopTools ? interactionMode : "none"}
                                            onToolAction={handleItemToolAction}
                                            actionState={itemActionState[item.url] || "idle"}
                                            shake={isDesktopTools && interactionMode === "block-author"}
                                        />
                                    ))
                                ) : (
                                    <p className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                        No entries matched your filters.
                                    </p>
                                )}
                            </section>
                        )
                    )
                ) : null}
            </section>
        </main>
    );
}