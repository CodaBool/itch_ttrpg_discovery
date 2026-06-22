import { useEffect, useMemo, useState } from "react";
import FilterPill from "./components/FilterPill";
import ItemCard from "./components/ItemCard";

const PRIMARY_TAGS = [
    "horror",
    "role-playing",
    "tabletop",
    "zine",
    "one-page",
    "rules-lite",
    "supplement",
    "fanzine",
    "micro-rpg",
    "vtt",
    "ttrpg",
];

// Less popular tags: intentionally included in the same array so discovery still catches them.
const SECONDARY_TAGS = [
    "osr",
    "tabletop",
    "body-horror",
    "liminal-horror",
    "mothership",
    "mothership-rpg",
    "tabletop-role-playing-game",
    "foundryvtt",
    "panic-engine",
    "generation",
    "generated",
    "generator",
    "tool",
];

const GENRE_TAGS = ["genre-rpg", "genre-adventure"];
const TAGS = [...new Set([...PRIMARY_TAGS, ...SECONDARY_TAGS, ...GENRE_TAGS])];

const CATEGORIES = [
    { name: "Assets", slug: "game-assets" },
    { name: "Physical Game", slug: "physical-games" },
    { name: "Other", slug: "misc" },
    { name: "Game mod", slug: "game-mods" },
    { name: "Tool", slug: "tools" },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function App() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [activeTag, setActiveTag] = useState("");
    const [activeCategory, setActiveCategory] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function load() {
            setLoading(true);
            setError("");

            try {
                const params = new URLSearchParams({ limit: "160" });
                if (activeTag) params.set("tag", activeTag);
                if (activeCategory) params.set("category", activeCategory);
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
    }, [search, activeTag, activeCategory]);

    const stats = useMemo(() => {
        return {
            total: items.length,
            withImages: items.filter((i) => Boolean(i.image_url)).length,
            uniqueAuthors: new Set(items.map((i) => i.author).filter(Boolean)).size,
        };
    }, [items]);

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
                        This fan feed pulls matching entries from itch XML sources every ~2 minutes and merges all source hits per item URL.
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
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Category</p>
                        <div className="flex flex-wrap gap-2">
                            <FilterPill label="All" active={!activeCategory} onClick={() => setActiveCategory("")} />
                            {CATEGORIES.map((c) => (
                                <FilterPill
                                    key={c.slug}
                                    label={c.name}
                                    active={activeCategory === c.slug}
                                    onClick={() => setActiveCategory((prev) => (prev === c.slug ? "" : c.slug))}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Tags & genres</p>
                        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                            <FilterPill label="All" active={!activeTag} onClick={() => setActiveTag("")} />
                            {TAGS.map((tag) => (
                                <FilterPill
                                    key={tag}
                                    label={tag}
                                    active={activeTag === tag}
                                    onClick={() => setActiveTag((prev) => (prev === tag ? "" : tag))}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {loading ? <p className="mt-6 text-sm text-slate-300">Loading feed entries...</p> : null}
                {error ? <p className="mt-6 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}

                {!loading && !error ? (
                    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.length ? (
                            items.map((item) => <ItemCard key={item.url} item={item} />)
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