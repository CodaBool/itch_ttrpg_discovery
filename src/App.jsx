import { useEffect, useMemo, useState } from "react";
import FilterPill from "./components/FilterPill";
import ItemCard from "./components/ItemCard";

const CATEGORY_OPTIONS = [
    { slug: "tools", label: "Tools" },
    { slug: "game-assets", label: "Assets" },
    { slug: "physical-games", label: "Games" },
];

// Keep in sync with worker/src/index.js PAIR_TAGS.
const PAIR_TAGS = ["horror", "body-horror", "generation", "generated", "generator", "tool"];

// Keep in sync with worker/src/index.js SOLO_TAGS.
const SOLO_TAGS = [
    "zine",
    "one-page",
    "rules-lite",
    "supplement",
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

const SYSTEM_TAGS = [
    "liminal-horror",
    "mothership",
    "mork-borg",
    "delta-green",
    "call-of-cthulhu",
    "triangle-agency",
    "mausritter",
    "cairn",
    "into-the-odd",
    "fist",
];

const SYSTEM_FILTERS = [
    { key: "liminal-horror", label: "Liminal Horror" },
    { key: "mothership", label: "Mothership" },
    { key: "mork-borg", label: "Mork Borg" },
    { key: "delta-green", label: "Delta Green" },
    { key: "call-of-cthulhu", label: "Call of Cthulhu" },
    { key: "triangle-agency", label: "Triangle Agency" },
    { key: "mausritter", label: "Mausritter" },
    { key: "cairn", label: "Cairn" },
    { key: "into-the-odd", label: "Into the Odd" },
    { key: "fist", label: "FIST" },
];

const HIDDEN_ALIAS_TAGS = ["mothership-rpg", "panic-engine"];

const ALL_TAGS = [...new Set([...PAIR_TAGS, ...SOLO_TAGS])];
const NON_SYSTEM_TAGS = ALL_TAGS.filter(
    (tag) => !SYSTEM_TAGS.includes(tag) && !HIDDEN_ALIAS_TAGS.includes(tag)
);

const STORAGE_KEYS = {
    category: "itch-feed:selected-category",
    system: "itch-feed:selected-system",
    tags: "itch-feed:selected-tags",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

const SYSTEM_MATCH_TAGS = {
    mothership: ["mothership", "mothership-rpg", "panic-engine"],
};

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

function loadStoredValue(key, fallback, allowedValues) {
    if (typeof window === "undefined") return fallback;

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "string") return fallback;
        return allowedValues.includes(parsed) ? parsed : fallback;
    } catch {
        return fallback;
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

function toggleValue(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
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
    return item.source.some((source) => source.category_slug === slug);
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

function getTimeBucket(item, now = new Date()) {
    const d = parseItemDate(item);
    if (!d) return "beyond";

    const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
    const sameMonth = sameYear && d.getUTCMonth() === now.getUTCMonth();

    if (sameMonth) return "this-month";
    if (sameYear) return "this-year";
    return "beyond";
}

const BUCKET_META = {
    "this-month": { label: "This Month" },
    "this-year": { label: "This Year" },
    beyond: { label: "Over a year" },
};

const BUCKET_ORDER = ["this-month", "this-year", "beyond"];

export default function App() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(() =>
        loadStoredValue(
            STORAGE_KEYS.category,
            "physical-games",
            CATEGORY_OPTIONS.map((option) => option.slug)
        )
    );
    const [selectedSystem, setSelectedSystem] = useState(() =>
        loadStoredSystemValue()
    );
    const [selectedTags, setSelectedTags] = useState(() =>
        loadStoredArray(STORAGE_KEYS.tags, NON_SYSTEM_TAGS, NON_SYSTEM_TAGS)
    );

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
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(selectedTags));
    }, [selectedTags]);

    useEffect(() => {
        const controller = new AbortController();

        async function load() {
            setLoading(true);
            setError("");

            try {
                const params = new URLSearchParams({ limit: "250" });
                if (search.trim()) params.set("q", search.trim());

                const response = await fetch(`${API_BASE}/api/items?${params.toString()}`, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }

                const payload = await response.json();
                setItems(Array.isArray(payload.items) ? payload.items : []);
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

    const visibleItems = useMemo(() => {
        return items.filter((item) => {
            const categoryMatch = hasCategory(item, selectedCategory);

            if (!categoryMatch) return false;

            const tags = itemTagSet(item);

            if (selectedSystem) {
                const matchTags = SYSTEM_MATCH_TAGS[selectedSystem] || [selectedSystem];
                return matchTags.some((tag) => tags.has(tag));
            }

            if (selectedTags.length === 0) return true;
            return selectedTags.some((tag) => tags.has(tag));
        });
    }, [items, selectedCategory, selectedSystem, selectedTags]);

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
            "this-month": [],
            "this-year": [],
            beyond: [],
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

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.2),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(14,165,233,.18),transparent_40%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-14 pt-8 text-slate-100 md:px-8">
            <section className="mx-auto w-full max-w-7xl">

                <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-2 backdrop-blur-sm md:p-5">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Search</label>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search title or description"
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-orange-300/60"
                    />

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
                            {SYSTEM_FILTERS.map((system) => (
                                <FilterPill
                                    key={system.key}
                                    label={system.label}
                                    active={selectedSystem === system.key}
                                    onClick={() =>
                                        setSelectedSystem((prev) => (prev === system.key ? "" : system.key))
                                    }
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
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
                    </div>
                </section>

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

                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {group.items.map((item) => (
                                            <ItemCard key={item.url} item={item} />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </section>
                    ) : (
                        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {visibleItems.length ? (
                                visibleItems.map((item) => <ItemCard key={item.url} item={item} />)
                            ) : (
                                <p className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                    No entries matched your filters.
                                </p>
                            )}
                        </section>
                    )
                ) : null}
            </section>
        </main>
    );
}