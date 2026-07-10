import { useEffect, useMemo, useState } from "react";
import FilterPill from "./components/FilterPill";
import ItemCard from "./components/ItemCard";
import PreferenceForm from "./components/PreferenceForm";
import Jams from "./Jams";
import NewsletterBuilder from "./NewsletterBuilder";
import { banAuthor, banUrl, createAdminClientFromEnv, isAdminEnabled } from "./admin";
import { loadPreferenceDraft, makeDefaultSystemScores, savePreferenceDraft } from "./preferencesStorage";



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
  "generator",
  "tool",
  "mystery",
  "investigation",
  "comedy",
  "survival-horror",
  "pbta",
  "forged-in-the-dark",
  "sci-fi",
  "tabletop",
  "one-page",
  "zine",
  "fanzine",
  "supplement",
  "cyborg",
];

const SOLO_TAGS = [
  "one-shot",
  "rules-lite",
  "rules-light",
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
  "pirate-borg",
  "brindlewood",
  "carved-from-brindlewood",
  "electric-bastionland",
  "cain",
  "trophy-dark",
  "public-access",
];

const SYSTEM_DEFINITIONS = [
    { key: "liminal-horror", label: "Liminal Horror", tags: ["liminal-horror"] },
    { key: "mothership", label: "Mothership", tags: ["mothership", "mothership-rpg", "panic-engine"] },
    { key: "mork-borg", label: "Mork Borg", tags: ["mork-borg", "pirate-borg", "cyborg"] },
    { key: "delta-green", label: "Delta Green", tags: ["delta-green"] },
    { key: "call-of-cthulhu", label: "Call of Cthulhu", tags: ["call-of-cthulhu"] },
    { key: "triangle-agency", label: "Triangle Agency", tags: ["triangle-agency"] },
    { key: "mausritter", label: "Mausritter", tags: ["mausritter"] },
    { key: "cairn", label: "Cairn", tags: ["cairn"] },
    { key: "into-the-odd", label: "Into the Odd", tags: ["into-the-odd"] },
    { key: "fist", label: "FIST", tags: ["fist"] },
    { key: "brindlewood", label: "Brindlewood", tags: ["brindlewood", "carved-from-brindlewood"] },
    { key: "electric-bastionland", label: "Electric Bastionland", tags: ["electric-bastionland"] },
    { key: "cain", label: "CAIN", tags: ["cain"] },
    { key: "trophy-dark", label: "Trophy Dark", tags: ["trophy-dark"] },
    { key: "public-access", label: "Public Access", tags: ["public-access"] },
];

const SYSTEM_TAGS = SYSTEM_DEFINITIONS.map((system) => system.key);
const SYSTEM_FILTERS = SYSTEM_DEFINITIONS.map(({ key, label }) => ({ key, label }));

const HIDDEN_ALIAS_TAGS = ["mothership-rpg", "panic-engine", "carved-from-brindlewood", "pirate-borg", "cyborg"];

const ALL_TAGS = [...new Set([...PAIR_TAGS, ...SOLO_TAGS])];
const NON_SYSTEM_TAGS = ALL_TAGS.filter(
    (tag) => !SYSTEM_TAGS.includes(tag) && !HIDDEN_ALIAS_TAGS.includes(tag)
);

const STORAGE_KEYS = {
    category: "itch-feed:selected-category",
    system: "itch-feed:selected-system",
    focusedSystem: "itch-feed:focused-system",
    tags: "itch-feed:selected-tags",
    hideNonEnglish: "itch-feed:hide-non-english",
    hideAiAssisted: "itch-feed:hide-ai-assisted",
    minRatings: "itch-feed:min-ratings",
    hiddenUrls: "itch-feed:hidden-urls",
    blockedAuthors: "itch-feed:blocked-authors",
    alwaysShowBeyondYear: "itch-feed:always-show-over-365",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://itch-ttrpg-discovery.codabool.workers.dev";

const SYSTEM_TAGS_BY_KEY = Object.fromEntries(
    SYSTEM_DEFINITIONS.map((system) => [system.key, system.tags])
);

const SYSTEM_MATCH_TAGS = new Set(
    Object.values(SYSTEM_TAGS_BY_KEY)
        .flat()
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter(Boolean)
);

const VIP_AUTHORS = ["goblinarchives", "tombloom", "massif-press", "claymorerpgs"];
const HIDDEN_SOURCE_TERMS = ["ttrpg", "tabletop"];

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

function loadStoredFocusedSystemValue() {
    if (typeof window === "undefined") return "";

    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.focusedSystem);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "string") return "";

        const allowed = SYSTEM_FILTERS.map((system) => system.key);
        return allowed.includes(parsed) ? parsed : "";
    } catch {
        return "";
    }
}

function loadStoredBool(key, fallback = false) {
    if (typeof window === "undefined") return fallback;

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return typeof parsed === "boolean" ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function loadStoredNumber(key, fallback = 0, min = 0, max = Number.POSITIVE_INFINITY) {
    if (typeof window === "undefined") return fallback;

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        const value = Number(parsed);
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, Math.floor(value)));
    } catch {
        return fallback;
    }
}

function toggleValue(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
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

function parseRatingCount(item) {
    const raw = String(item?.rating || "").trim();
    if (!raw) return 0;

    const parts = raw.split("over");
    if (parts.length !== 2) return 0;

    const count = Number(parts[1]);
    if (!Number.isFinite(count)) return 0;
    return Math.max(0, Math.floor(count));
}

    function parseRatingMetrics(rawRating) {
        const value = String(rawRating || "").trim();
        if (!value.includes("over")) return { average: 0, count: 0 };

        const parts = value.split("over");
        if (parts.length !== 2) return { average: 0, count: 0 };

        const average = Number(parts[0]);
        const count = Number(parts[1]);

        return {
            average: Number.isFinite(average) ? average : 0,
            count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
        };
    }

    function positiveRatingCount(item) {
        const { average, count } = parseRatingMetrics(item?.rating);
        if (average < 4) return 0;
        return count;
    }

    function engagementCount(item) {
        const value = Number(item?.engagement);
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.floor(value));
    }

    function meetsSystemLevelRequirement(item, level) {
        const requirement = LEVEL_REQUIREMENTS[level] || LEVEL_REQUIREMENTS[4];
        const positive = positiveRatingCount(item);
        const engagement = engagementCount(item);

        if (positive < requirement.minPositive) return false;
        if (engagement < requirement.minEngagement) return false;
        return true;
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

const LEVEL_REQUIREMENTS = {
    0: { minPositive: Number.POSITIVE_INFINITY, minEngagement: Number.POSITIVE_INFINITY },
    1: { minPositive: 5, minEngagement: 1 },
    2: { minPositive: 3, minEngagement: 0 },
    3: { minPositive: 2, minEngagement: 0 },
    4: { minPositive: 1, minEngagement: 0 },
    5: { minPositive: 0, minEngagement: 0 },
};

const BUCKET_ORDER = ["last-30", "last-365", "over-365"];

export default function App() {
    const hasAdminToken = isAdminEnabled();
    const defaultSystems = useMemo(() => makeDefaultSystemScores(SYSTEM_FILTERS), []);
    const draft = useMemo(() => loadPreferenceDraft(defaultSystems), [defaultSystems]);
    const [activePage, setActivePage] = useState("discover");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(() =>
        loadStoredCategoryValue()
    );
    const [pendingSystemScores, setPendingSystemScores] = useState(draft.systems);
    const [systemScores, setSystemScores] = useState(draft.systems);
    const [focusedSystemKey, setFocusedSystemKey] = useState(() => loadStoredFocusedSystemValue());
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
    const [alwaysShowBeyondYear, setAlwaysShowBeyondYear] = useState(() => loadStoredBool(STORAGE_KEYS.alwaysShowBeyondYear, false));
    const [hideNonEnglish, setHideNonEnglish] = useState(draft.englishOnly);
    const [hideAiAssisted, setHideAiAssisted] = useState(draft.excludeAiAssisted);
    const [minRatings, setMinRatings] = useState(() => loadStoredNumber(STORAGE_KEYS.minRatings, 1, 0, 10));

    useEffect(() => {
        if (activePage !== "discover") return;

        const latest = loadPreferenceDraft(defaultSystems);
        setPendingSystemScores(latest.systems);
        setSystemScores(latest.systems);
        setHideNonEnglish(latest.englishOnly);
        setHideAiAssisted(latest.excludeAiAssisted);
        setBlockedAuthors(Array.isArray(latest.excludedCreators) ? latest.excludedCreators : []);
    }, [activePage, defaultSystems]);

    useEffect(() => {
        if (activePage !== "discover") return;

        const timeoutId = window.setTimeout(() => {
            setSystemScores(pendingSystemScores);
        }, 800);

        return () => window.clearTimeout(timeoutId);
    }, [activePage, pendingSystemScores]);

    const activeSystemKeys = useMemo(() => {
        if (focusedSystemKey) return [focusedSystemKey];

        return Object.entries(systemScores)
            .filter(([, score]) => Number(score) > 0)
            .map(([key]) => key);
    }, [systemScores, focusedSystemKey]);

    const blockedSystemKeys = useMemo(() => {
        if (focusedSystemKey) return [];

        return Object.entries(systemScores)
            .filter(([, score]) => Number(score) <= 0)
            .map(([key]) => key);
    }, [systemScores, focusedSystemKey]);

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
        window.localStorage.setItem(STORAGE_KEYS.hideNonEnglish, JSON.stringify(hideNonEnglish));
    }, [hideNonEnglish]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.hideAiAssisted, JSON.stringify(hideAiAssisted));
    }, [hideAiAssisted]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.focusedSystem, JSON.stringify(focusedSystemKey));
    }, [focusedSystemKey]);

    useEffect(() => {
        const existingDraft = loadPreferenceDraft(defaultSystems);
        savePreferenceDraft({
            ...existingDraft,
            systems: systemScores,
            englishOnly: hideNonEnglish,
            excludeAiAssisted: hideAiAssisted,
            excludedCreators: blockedAuthors,
        });
    }, [defaultSystems, systemScores, hideNonEnglish, hideAiAssisted, blockedAuthors]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.minRatings, JSON.stringify(minRatings));
    }, [minRatings]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(STORAGE_KEYS.alwaysShowBeyondYear, JSON.stringify(alwaysShowBeyondYear));
    }, [alwaysShowBeyondYear]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const media = window.matchMedia("(min-width: 768px) and (pointer: fine)");
        const apply = () => {
            const enabled = media.matches;
            setIsDesktopTools(enabled);
            if (!enabled) {
                setInteractionMode("none");
            }
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
                const collected = [];

                let offset = 0;
                let hasMore = true;
                let page = 0;

                while (hasMore && page < MAX_PAGES) {
                    const params = new URLSearchParams({
                        limit: String(PAGE_SIZE),
                        offset: String(offset),
                    });

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
    }, []);

    const hiddenUrlSet = useMemo(() => new Set(hiddenUrls), [hiddenUrls]);
    const blockedAuthorSet = useMemo(() => new Set(blockedAuthors), [blockedAuthors]);

    const visibleItems = useMemo(() => {
        return items.filter((item) => {
            const categoryMatch = hasCategory(item, selectedCategory);

            if (!categoryMatch) return false;

            if (hideNonEnglish && item.language != null) return false;

            if (hideAiAssisted && item.ai === "ai assisted") return false;

            if (parseRatingCount(item) < minRatings) return false;

            if (hiddenUrlSet.has(item.url)) return false;

            const authorKey = normalizeAuthorKey(item.author);
            if (authorKey && blockedAuthorSet.has(authorKey)) return false;

            const tags = itemTagSet(item);
            const hasAnySystemTag = Array.from(SYSTEM_MATCH_TAGS).some((tag) => tags.has(tag));

            if (focusedSystemKey) {
                const matchTags = getSystemMatchTags(focusedSystemKey);
                const tagMatched = matchTags.some((tag) => tags.has(tag));
                if (!tagMatched) return false;

                const level = Math.max(0, Math.min(5, Math.round(Number(systemScores[focusedSystemKey]) || 0)));
                if (level < 5 && !meetsSystemLevelRequirement(item, level)) return false;

                return true;
            }

            if (activeSystemKeys.length > 0 && hasAnySystemTag) {
                const matched = activeSystemKeys.some((systemKey) => {
                    const matchTags = getSystemMatchTags(systemKey);
                    const tagMatched = matchTags.some((tag) => tags.has(tag));
                    if (!tagMatched) return false;

                    const level = Math.max(0, Math.min(5, Math.round(Number(systemScores[systemKey]) || 0)));
                    if (level >= 5) return true;

                    return meetsSystemLevelRequirement(item, level);
                });

                if (matched) {
                    // Positive-interest match wins, even if the item also has other system tags.
                    return true;
                }
            }

            if (blockedSystemKeys.length > 0 && hasAnySystemTag) {
                const hasBlockedSystemTag = blockedSystemKeys.some((systemKey) => {
                    const matchTags = getSystemMatchTags(systemKey);
                    return matchTags.some((tag) => tags.has(tag));
                });

                if (hasBlockedSystemTag) return false;
            }

            if (activeSystemKeys.length > 0 && hasAnySystemTag) return false;

            if (selectedTags.length === 0) return true;
            return selectedTags.some((tag) => tags.has(tag));
        });
    }, [items, selectedCategory, focusedSystemKey, activeSystemKeys, blockedSystemKeys, systemScores, selectedTags, hiddenUrlSet, blockedAuthorSet, hideNonEnglish, hideAiAssisted, minRatings]);

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

        if (interactionMode === "ban" && hasAdminToken) {
            (async () => {
                try {
                    const client = createAdminClientFromEnv();
                    await banUrl(client, item.url, "Banned from UI", "local-ui");
                    setItems((prev) => prev.filter((row) => row.url !== item.url));
                } catch (err) {
                    setError(err?.message || "Failed to ban item.");
                }
            })();
        }
    }

    function handleAuthorToolAction(item) {
        if (!isDesktopTools || interactionMode !== "ban" || !hasAdminToken) return;
        const authorKey = normalizeAuthorKey(item.author);
        if (!authorKey) return;

        (async () => {
            try {
                const client = createAdminClientFromEnv();
                await banAuthor(client, authorKey, "Banned from UI", "local-ui");
                setItems((prev) => prev.filter((row) => normalizeAuthorKey(row.author) !== authorKey));
            } catch (err) {
                setError(err?.message || "Failed to ban author.");
            }
        })();
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
    const shouldShowBeyondYear = showBeyondYear || alwaysShowBeyondYear;
    const focusedSystemLabel = SYSTEM_FILTERS.find((system) => system.key === focusedSystemKey)?.label || focusedSystemKey;

    function enableAlwaysShowBeyondYear() {
        setAlwaysShowBeyondYear(true);
        setShowBeyondYear(true);
    }

    useEffect(() => {
        setShowBeyondYear(false);
    }, [selectedCategory, systemScores, selectedTags]);

    if (activePage === "jams") {
        return <Jams onBack={() => setActivePage("discover")} />;
    }

    if (activePage === "newsletter") {
        return (
            <NewsletterBuilder
                onBack={() => setActivePage("discover")}
                systems={SYSTEM_FILTERS}
            />
        );
    }

    return (
        <main
            className={[
                "min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.2),transparent_45%),radial-gradient(circle_at_90%_20%,rgba(14,165,233,.18),transparent_40%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-1 pb-14 pt-1 text-slate-100 md:px-8",
                isDesktopTools && interactionMode === "block-author" ? "tool-mode-block" : "",
                isDesktopTools && interactionMode === "hide-item" ? "tool-mode-stamp" : "",
            ].join(" ")}
        >
            <section className="mx-auto w-full max-w-7xl">
                <section className="relative rounded-2xl border border-white/10 bg-slate-950/45 p-2 backdrop-blur-sm md:p-5">
                    <div className="mt-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Category</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
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
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActivePage("newsletter")}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-amber-200/40 bg-amber-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/70"
                                >
                                    Newsletter Builder
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActivePage("jams")}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cyan-200/40 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/70"
                                >
                                    Browse Jams
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="button"
                            className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-white/20"
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
                            <PreferenceForm
                                systems={SYSTEM_FILTERS}
                                systemScores={pendingSystemScores}
                                onSystemScoreChange={(systemKey, value) => {
                                    setPendingSystemScores((prev) => ({
                                        ...prev,
                                        [systemKey]: Math.min(5, Math.max(0, Math.round(Number(value) || 0))),
                                    }));
                                }}
                                focusedSystemKey={focusedSystemKey}
                                onSystemFocusToggle={(systemKey) => {
                                    setFocusedSystemKey((prev) => (prev === systemKey ? "" : systemKey));
                                }}
                                englishOnly={hideNonEnglish}
                                onEnglishOnlyChange={setHideNonEnglish}
                                excludeAiAssisted={hideAiAssisted}
                                onExcludeAiAssistedChange={setHideAiAssisted}
                                includeNewsletterExtras={false}
                                theme="orange"
                            />

                            {/* I have removed UI for tag selection, because it's not as useful of a feature as I expected */}

                            <label className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="font-semibold uppercase tracking-[0.12em]">Global minimum number of ratings</span>
                                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">{minRatings}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={10}
                                    step={1}
                                    value={minRatings}
                                    onChange={(event) => setMinRatings(Number(event.target.value) || 0)}
                                    className="w-full accent-amber-300"
                                />
                            </label>

                            {isDesktopTools ? (
                                <div className="grid gap-3 md:grid-cols-2">
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
                                </div>
                            ) : null}

                            <div className="flex w-full items-center justify-between gap-3">
                                <a
                                    href="https://github.com/CodaBool/itch_ttrpg_discovery"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/20 bg-white/[0.03] px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-100 transition hover:border-white/40 md:px-3"
                                    aria-label="Open project GitHub repository"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        fill="currentColor"
                                        viewBox="0 0 16 16"
                                        aria-hidden="true"
                                    >
                                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
                                    </svg>
                                    <span className="hidden md:inline">GPL3 - always Free</span>
                                </a>

                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">
                                    <span className="hidden md:inline">Made with</span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="red"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="hidden md:inline animate-pulse"
                                        aria-hidden="true"
                                    >
                                        <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
                                    </svg>
                                    <span className="md:hidden">By</span>
                                    <span><a href="https://codabool.itch.io" target="_blank">CodaBool</a></span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="red"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="inline md:hidden animate-pulse"
                                        aria-hidden="true"
                                    >
                                        <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    {isAdvancedOpen ? (
                        <img
                            src="/pom.gif"
                            alt="pom pom"
                            className="pointer-events-none absolute bottom-0 left-1/2 h-19 w-auto max-w-none -translate-x-1/2 object-contain"
                            loading="lazy"
                        />
                    ) : null}
                </section>

                {isDesktopTools ? (
                    <div className="fixed left-[min(calc((100vw+80rem)/2+1rem),calc(100vw-5.5rem))] top-1/2 z-50 flex -translate-y-1/2 flex-col gap-3">
                        {hasAdminToken ? (
                            <div className="group relative">
                                <button
                                    type="button"
                                    onClick={() => setInteractionMode((prev) => (prev === "ban" ? "none" : "ban"))}
                                    className={[
                                        "flex h-14 w-14 items-center justify-center rounded-xl border p-2 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.85)] backdrop-blur-sm transition",
                                        interactionMode === "ban"
                                            ? "border-red-300/80 bg-red-300/20"
                                            : "border-white/20 bg-slate-950/70 hover:border-red-200/50",
                                    ].join(" ")}
                                    aria-label="ban this item or author"
                                >
                                    {interactionMode === "ban" ? null : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="red" viewBox="0 0 512 512" className="h-8 w-8" aria-hidden="true"><path d="M242 1q-44 3-86 20A260 260 0 0 0 7 312q15 72 68 124A256 256 0 1 0 241 1m49 78q28 6 54 20l9 5-125 125-124 125-3-4c-5-8-14-28-17-39-7-21-8-29-8-54 0-21 0-25 2-35q10-54 48-91 42-43 97-52l12-2a304 304 0 0 1 55 2m127 99q11 20 15 44c2 9 2 14 2 34 1 25-1 35-7 55a181 181 0 0 1-262 101l-8-5 125-124 125-125 2 4z"/></svg>
                                    )}
                                </button>
                                <span className="pointer-events-none absolute right-full top-1/2 mr-3 w-64 -translate-y-1/2 rounded-xl border border-white/30 bg-slate-900 px-4 py-3 text-sm font-semibold uppercase leading-snug tracking-[0.12em] text-slate-100 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.85)] opacity-0 transition group-hover:opacity-100">
                                    ban item (card) or creator (name)
                                </span>
                            </div>
                        ) : null}

                        <div className="group relative">
                            <button
                                type="button"
                                onClick={() => setInteractionMode((prev) => (prev === "block-author" ? "none" : "block-author"))}
                                className={[
                                    "flex h-14 w-14 items-center justify-center rounded-xl border p-2 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.85)] backdrop-blur-sm transition",
                                    interactionMode === "block-author"
                                        ? "border-rose-300/80 bg-rose-300/20"
                                        : "border-white/20 bg-slate-950/70 hover:border-rose-200/50",
                                ].join(" ")}
                                aria-label="no longer show this creator"
                            >
                                {interactionMode === "block-author" ? null : (
                                    <img src="/scissors_closed.webp" alt="Block creator mode" className="h-10 w-10 object-contain" />
                                )}
                            </button>
                            <span className="pointer-events-none absolute right-full top-1/2 mr-3 w-64 -translate-y-1/2 rounded-xl border border-white/30 bg-slate-900 px-4 py-3 text-sm font-semibold uppercase leading-snug tracking-[0.12em] text-slate-100 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.85)] opacity-0 transition group-hover:opacity-100">
                                no longer show this creator
                            </span>
                        </div>

                        <div className="group relative">
                            <button
                                type="button"
                                onClick={() => setInteractionMode((prev) => (prev === "hide-item" ? "none" : "hide-item"))}
                                className={[
                                    "flex h-14 w-14 items-center justify-center rounded-xl border p-2 shadow-[0_12px_24px_-14px_rgba(0,0,0,0.85)] backdrop-blur-sm transition",
                                    interactionMode === "hide-item"
                                        ? "border-red-300/80 bg-red-300/20"
                                        : "border-white/20 bg-slate-950/70 hover:border-red-200/50",
                                ].join(" ")}
                                aria-label="mark an item as seen, so it won't be shown again"
                            >
                                {interactionMode === "hide-item" ? null : (
                                    <img src="/stamp.webp" alt="Mark seen mode" className="h-10 w-10 object-contain" />
                                )}
                            </button>
                            <span className="pointer-events-none absolute right-full top-1/2 mr-3 w-64 -translate-y-1/2 rounded-xl border border-white/30 bg-slate-900 px-4 py-3 text-sm font-semibold uppercase leading-snug tracking-[0.12em] text-slate-100 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.85)] opacity-0 transition group-hover:opacity-100">
                                mark an item as seen, so it won't be shown again
                            </span>
                        </div>
                    </div>
                ) : null}

                {loading ? <p className="mt-6 text-sm text-slate-300">Loading feed entries...</p> : null}
                {error ? <p className="mt-6 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}
                {focusedSystemKey ? (
                    <p className="my-2 mx-1 rounded-xl border border-amber-300/55 bg-amber-300/15 p-3 text-sm font-semibold text-amber-100">
                        {`Only showing items from the ${focusedSystemLabel} system`}
                    </p>
                ) : null}

                {!loading && !error ? (
                    showTimelineLayout ? (
                        <section className="mt-1 space-y-8">
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
                                            {shouldShowBeyondYear ? null : (
                                                <>
                                                    <p className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/90">
                                                        Data is gathered by itch's newest page. Results over a year old are limited.
                                                    </p>

                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowBeyondYear(true)}
                                                            className="rounded-xl border border-amber-200/50 bg-amber-300/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/80"
                                                        >
                                                            {`Show ${group.label} (${group.items.length})`}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={enableAlwaysShowBeyondYear}
                                                            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100/90 transition hover:text-amber-100"
                                                            aria-label="Always show over 365 day items"
                                                        >
                                                            <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-200/70 bg-amber-300/10" aria-hidden="true" />
                                                            <span>Always show over 365 day items</span>
                                                        </button>
                                                    </div>
                                                </>
                                            )}

                                            {shouldShowBeyondYear ? (
                                                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3 2xl:grid-cols-4">
                                                    {group.items.map((item) => (
                                                        <ItemCard
                                                            key={item.url}
                                                            item={item}
                                                            isVipAuthor={VIP_AUTHORS.includes(normalizeAuthorKey(item.author))}
                                                            interactionMode={isDesktopTools ? interactionMode : "none"}
                                                            onToolAction={handleItemToolAction}
                                                            onAuthorToolAction={handleAuthorToolAction}
                                                            actionState={itemActionState[item.url] || "idle"}
                                                            shake={isDesktopTools && interactionMode === "block-author"}
                                                            hiddenSourceTags={[]}
                                                            hiddenSourceTerms={HIDDEN_SOURCE_TERMS}
                                                        />
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3 2xl:grid-cols-4">
                                            {group.items.map((item) => (
                                                <ItemCard
                                                    key={item.url}
                                                    item={item}
                                                    isVipAuthor={VIP_AUTHORS.includes(normalizeAuthorKey(item.author))}
                                                    interactionMode={isDesktopTools ? interactionMode : "none"}
                                                    onToolAction={handleItemToolAction}
                                                    onAuthorToolAction={handleAuthorToolAction}
                                                    actionState={itemActionState[item.url] || "idle"}
                                                    shake={isDesktopTools && interactionMode === "block-author"}
                                                    hiddenSourceTags={[]}
                                                    hiddenSourceTerms={HIDDEN_SOURCE_TERMS}
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
                                {shouldShowBeyondYear ? null : (
                                    <>
                                        <p className="rounded-xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/90">
                                            Data is gathered by itch's newest page. Results over a year old are limited.
                                        </p>

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowBeyondYear(true)}
                                                className="rounded-xl border border-amber-200/50 bg-amber-300/15 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/80"
                                            >
                                                {`Show ${singleBucket.label} (${singleBucket.items.length})`}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={enableAlwaysShowBeyondYear}
                                                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100/90 transition hover:text-amber-100"
                                                aria-label="Always show over 365 day items"
                                            >
                                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-200/70 bg-amber-300/10" aria-hidden="true" />
                                                <span>Always show over 365 day items</span>
                                            </button>
                                        </div>
                                    </>
                                )}

                                {shouldShowBeyondYear ? (
                                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3 2xl:grid-cols-4">
                                        {singleBucket.items.map((item) => (
                                            <ItemCard
                                                key={item.url}
                                                item={item}
                                                isVipAuthor={VIP_AUTHORS.includes(normalizeAuthorKey(item.author))}
                                                interactionMode={isDesktopTools ? interactionMode : "none"}
                                                onToolAction={handleItemToolAction}
                                                onAuthorToolAction={handleAuthorToolAction}
                                                actionState={itemActionState[item.url] || "idle"}
                                                shake={isDesktopTools && interactionMode === "block-author"}
                                                hiddenSourceTags={[]}
                                                hiddenSourceTerms={HIDDEN_SOURCE_TERMS}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        ) : (
                            <section className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3 2xl:grid-cols-4">
                                {visibleItems.length ? (
                                    visibleItems.map((item) => (
                                        <ItemCard
                                            key={item.url}
                                            item={item}
                                            isVipAuthor={VIP_AUTHORS.includes(normalizeAuthorKey(item.author))}
                                            interactionMode={isDesktopTools ? interactionMode : "none"}
                                            onToolAction={handleItemToolAction}
                                            onAuthorToolAction={handleAuthorToolAction}
                                            actionState={itemActionState[item.url] || "idle"}
                                            shake={isDesktopTools && interactionMode === "block-author"}
                                            hiddenSourceTags={[]}
                                            hiddenSourceTerms={HIDDEN_SOURCE_TERMS}
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