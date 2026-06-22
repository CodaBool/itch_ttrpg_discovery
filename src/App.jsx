import { useEffect, useMemo, useState } from "react";
import FilterPill from "./components/FilterPill";
import ItemCard from "./components/ItemCard";

const SYSTEM_FILTERS = [
    { key: "mothership", label: "Mothership" },
    { key: "liminal-horror", label: "Liminal Horror" },
    { key: "mork-borg", label: "Mork Borg" },
    { key: "delta-green", label: "Delta Green" },
    { key: "call-of-cthulhu", label: "Call of Cthulhu" },
    { key: "triangle-agency", label: "Triangle Agency" },
    { key: "mausritter", label: "Mausritter" },
    { key: "cairn", label: "Cairn" },
    { key: "into-the-odd", label: "Into the Odd" },
    { key: "fist", label: "FIST" },
];

const TOOL_LIKE_TAGS = ["tool", "generator", "generated", "generation"];
const HORROR_LIKE_TAGS = ["horror", "body-horror", "liminal-horror"];

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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

function hasAnyTag(item, wantedTags) {
    const wanted = new Set(wantedTags.map((tag) => tag.toLowerCase()));
    return item.source.some((source) => {
        const tags = readSourceTags(source);
        return tags.some((tag) => wanted.has(tag));
    });
}

function hasCategory(item, slug) {
    return item.source.some((source) => source.category_slug === slug);
}

export default function App() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState("all");

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
        if (activeFilter === "all") return items;

        if (activeFilter.startsWith("system:")) {
            const systemTag = activeFilter.split(":")[1] || "";
            return items.filter((item) => hasAnyTag(item, [systemTag]));
        }

        if (activeFilter === "tool") {
            return items.filter((item) => hasCategory(item, "tools") || hasAnyTag(item, TOOL_LIKE_TAGS));
        }

        if (activeFilter === "asset") {
            return items.filter((item) => hasCategory(item, "game-assets"));
        }

        if (activeFilter === "horror") {
            return items.filter((item) => hasAnyTag(item, HORROR_LIKE_TAGS));
        }

        if (activeFilter === "other") {
            return items.filter((item) => {
                const isTool = hasCategory(item, "tools") || hasAnyTag(item, TOOL_LIKE_TAGS);
                const isAsset = hasCategory(item, "game-assets");
                const isHorror = hasAnyTag(item, HORROR_LIKE_TAGS);
                const isSystem = SYSTEM_FILTERS.some((system) => hasAnyTag(item, [system.key]));
                return !isTool && !isAsset && !isHorror && !isSystem;
            });
        }

        return items;
    }, [activeFilter, items]);

    const stats = useMemo(() => {
        return {
            total: visibleItems.length,
            withImages: visibleItems.filter((i) => Boolean(i.image_url)).length,
            uniqueAuthors: new Set(visibleItems.map((i) => i.author).filter(Boolean)).size,
        };
    }, [visibleItems]);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.2),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(14,165,233,.18),transparent_40%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-14 pt-8 text-slate-100 md:px-8">
            <section className="mx-auto w-full max-w-7xl">
                <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45 p-6 backdrop-blur-sm md:p-10">
                    <div className="absolute -left-16 top-16 h-40 w-40 rounded-full bg-orange-400/20 blur-3xl" />
                    <div className="absolute -right-12 top-6 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl" />
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">Itch TTRPG Discovery</p>
                      <h1 className="mt-3 max-w-3xl font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white md:text-5xl">
                        Fresh indie RPGs, tools, zines, and weird tabletop experiments
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
                        This fan feed pulls trusted tag combinations from itch XML sources every ~2 minutes and merges all source hits per item URL.
                    </p>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Loaded entries</p>
                            <p className="mt-1 text-2xl font-semibold text-amber-100">{stats.total}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">With images</p>
                            <p className="mt-1 text-2xl font-semibold text-cyan-100">{stats.withImages}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Unique creators</p>
                            <p className="mt-1 text-2xl font-semibold text-emerald-100">{stats.uniqueAuthors}</p>
                        </div>
                    </div>
                </header>

                <section className="mt-6 rounded-2xl border border-white/10 bg-slate-950/45 p-4 backdrop-blur-sm md:p-5">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Search</label>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search title or description"
                        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-orange-300/60"
                    />

                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Systems</p>
                        <div className="flex flex-wrap gap-2">
                            <FilterPill
                                label="All"
                                active={activeFilter === "all"}
                                onClick={() => setActiveFilter("all")}
                            />
                            {SYSTEM_FILTERS.map((system) => (
                                <FilterPill
                                    key={system.key}
                                    label={system.label}
                                    active={activeFilter === `system:${system.key}`}
                                    onClick={() => setActiveFilter(`system:${system.key}`)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Focus</p>
                        <div className="flex flex-wrap gap-2">
                            <FilterPill label="Tool" active={activeFilter === "tool"} onClick={() => setActiveFilter("tool")} />
                            <FilterPill label="Asset" active={activeFilter === "asset"} onClick={() => setActiveFilter("asset")} />
                            <FilterPill label="Horror" active={activeFilter === "horror"} onClick={() => setActiveFilter("horror")} />
                            <FilterPill label="Other" active={activeFilter === "other"} onClick={() => setActiveFilter("other")} />
                        </div>
                    </div>
                </section>

                {loading ? <p className="mt-6 text-sm text-slate-300">Loading feed entries...</p> : null}
                {error ? <p className="mt-6 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}

                {!loading && !error ? (
                    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visibleItems.length ? (
                            visibleItems.map((item) => <ItemCard key={item.url} item={item} />)
                        ) : (
                            <p className="col-span-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                No entries matched your filters.
                            </p>
                        )}
                    </section>
                ) : null}
            </section>
        </main>
    );
}