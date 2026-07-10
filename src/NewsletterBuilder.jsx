import { useEffect, useMemo, useRef, useState } from "react";
import PreferenceForm from "./components/PreferenceForm";
import { loadPreferenceDraft, makeDefaultSystemScores, savePreferenceDraft } from "./preferencesStorage";

const STORAGE_KEYS = {
  blockedAuthors: "itch-feed:blocked-authors",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://itch-ttrpg-discovery.codabool.workers.dev";

function loadStoredArray(key) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeCreatorName(value) {
  return String(value || "").trim().toLowerCase();
}

export default function NewsletterBuilder({ onBack, systems = [] }) {
  const defaultSystems = useMemo(() => makeDefaultSystemScores(systems), [systems]);
  const draft = useMemo(() => loadPreferenceDraft(defaultSystems), [defaultSystems]);

  const [email, setEmail] = useState(draft.email);
  const [systemScores, setSystemScores] = useState(draft.systems);
  const [majorAwards, setMajorAwards] = useState(draft.majorAwards);
  const [englishOnly, setEnglishOnly] = useState(draft.englishOnly);
  const [minRatings, setMinRatings] = useState(() => {
    const value = Number(draft.minRatings);
    if (!Number.isFinite(value)) return 1;
    return Math.max(0, Math.min(10, Math.floor(value)));
  });
  const [addGameAssets, setAddGameAssets] = useState(draft.addGameAssets);
  const [addToolsMiscGameMods, setAddToolsMiscGameMods] = useState(draft.addToolsMiscGameMods);
  const [excludedCreators, setExcludedCreators] = useState(() => {
    const blocked = loadStoredArray(STORAGE_KEYS.blockedAuthors);
    return Array.from(new Set([...blocked, ...draft.excludedCreators]));
  });
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState("notice");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [existingPreferenceText, setExistingPreferenceText] = useState("");
  const previewAbortRef = useRef(null);

  useEffect(() => {
    savePreferenceDraft({
      email,
      systems: systemScores,
      majorAwards,
      englishOnly,
      minRatings,
      addGameAssets,
      addToolsMiscGameMods,
      excludedCreators,
    });
  }, [email, systemScores, majorAwards, englishOnly, minRatings, addGameAssets, addToolsMiscGameMods, excludedCreators]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.blockedAuthors, JSON.stringify(excludedCreators));
  }, [excludedCreators]);

  async function runPreviewFetch() {
    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
    }

    const controller = new AbortController();
    previewAbortRef.current = controller;

    setPreviewLoading(true);
    setPreviewError("");

    try {
      const response = await fetch(`${API_BASE}/api/newsletter/preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Your Indie TTRPG Digest",
          systems: systemScores,
          majorAwards,
          englishOnly,
          minRatings,
          addGameAssets,
          addToolsMiscGameMods,
          excludedCreators,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Newsletter preview failed (${response.status})`);
      }

      const payload = await response.json();

      if (previewAbortRef.current === controller) {
        setPreviewHtml(String(payload.html || ""));
        setPreviewCount(Number(payload.count || 0));
      }
    } catch (error) {
      if (error?.name !== "AbortError" && previewAbortRef.current === controller) {
        setPreviewError(error?.message || "Failed to load newsletter preview.");
      }
    } finally {
      if (previewAbortRef.current === controller) {
        setPreviewLoading(false);
      }
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const timeoutId = window.setTimeout(() => {
      runPreviewFetch();
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [systemScores, majorAwards, englishOnly, minRatings, addGameAssets, addToolsMiscGameMods, excludedCreators]);

  useEffect(() => {
    return () => {
      if (previewAbortRef.current) {
        previewAbortRef.current.abort();
      }
    };
  }, []);

  function updateSystemScore(systemKey, value) {
    setSystemScores((prev) => ({
      ...prev,
      [systemKey]: Math.min(5, Math.max(0, Math.round(Number(value) || 0))),
    }));
  }

  function removeCreator(name) {
    setExcludedCreators((prev) => prev.filter((entry) => entry !== name));
  }

  function currentPreferencePayload() {
    return {
      systems: systemScores,
      majorAwards,
      englishOnly,
      minRatings,
      addGameAssets,
      addToolsMiscGameMods,
      excludedCreators,
    };
  }

  function resetConfirmModal() {
    setIsConfirmOpen(false);
    setConfirmStep("notice");
    setConfirmError("");
    setConfirmLoading(false);
    setExistingPreferenceText("");
  }

  function openLooksGoodModal() {
    setIsConfirmOpen(true);
    setConfirmStep("notice");
    setConfirmError("");
    setConfirmLoading(false);
    setExistingPreferenceText("");
  }

  async function savePreferences() {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      setConfirmError("Email is required before saving preferences.");
      return false;
    }

    const response = await fetch(`${API_BASE}/api/newsletter/preferences`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: normalizedEmail,
        preference: currentPreferencePayload(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Save failed (${response.status})`);
    }

    return true;
  }

  async function handleAcknowledgeBias() {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      setConfirmError("Please enter an email first.");
      return;
    }

    setConfirmLoading(true);
    setConfirmError("");

    try {
      const checkResponse = await fetch(`${API_BASE}/api/newsletter/preferences?email=${encodeURIComponent(normalizedEmail)}`);
      if (!checkResponse.ok) {
        throw new Error(`Check failed (${checkResponse.status})`);
      }

      const checkPayload = await checkResponse.json();

      if (checkPayload.exists) {
        setExistingPreferenceText(JSON.stringify(checkPayload.preference_json || {}, null, 2));
        setConfirmStep("existing");
        return;
      }

      await savePreferences();
      setConfirmStep("saved");
    } catch (error) {
      setConfirmError(error?.message || "Unable to continue.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleReplaceExistingPreferences() {
    setConfirmLoading(true);
    setConfirmError("");

    try {
      await savePreferences();
      setConfirmStep("saved");
    } catch (error) {
      setConfirmError(error?.message || "Unable to replace preferences.");
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_8%_0%,rgba(14,165,233,.15),transparent_45%),radial-gradient(circle_at_95%_18%,rgba(249,115,22,.14),transparent_38%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-12 pt-8 text-slate-100 md:px-8">
      <section className="mx-auto w-full max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/25 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/45"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Discover
          </button>

          <h1 className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-100 md:text-base">
            Newsletter
          </h1>
        </div>

        <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 backdrop-blur-sm md:p-6">
          <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
            <p className="text-sm text-slate-200 md:text-base">
              Monthly email tailored to your interests (no ads, monetization, or any nonsense. I do accept donations on <a href="https://ko-fi.com/codabool" target="_blank" className="text-cyan-100">kofi</a>).
            </p>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/60"
              />
            </div>

            <PreferenceForm
              systems={systems}
              systemScores={systemScores}
              onSystemScoreChange={updateSystemScore}
              englishOnly={englishOnly}
              onEnglishOnlyChange={setEnglishOnly}
              majorAwards={majorAwards}
              onMajorAwardsChange={setMajorAwards}
              addGameAssets={addGameAssets}
              onAddGameAssetsChange={setAddGameAssets}
              addToolsMiscGameMods={addToolsMiscGameMods}
              onAddToolsMiscGameModsChange={setAddToolsMiscGameMods}
              includeNewsletterExtras={true}
              theme="blue"
            />

            <label className="block rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-semibold uppercase tracking-[0.12em]">Minimum rating for everything else</span>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100">{minRatings}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={minRatings}
                onChange={(event) => setMinRatings(Number(event.target.value) || 0)}
                className="w-full accent-cyan-300"
              />
            </label>

            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Excluded creators</p>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  {excludedCreators.length ? (
                    excludedCreators.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-100"
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => removeCreator(name)}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] leading-none text-slate-200 hover:border-red-200/70 hover:text-red-200"
                          aria-label={`Remove ${name}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No excluded creators yet.</span>
                  )}
                </div>
              </div>
            </div>

            {previewError ? (
              <p className="rounded-xl border border-red-300/40 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                {previewError}
              </p>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#f6f8fc] text-slate-900 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.75)]">
              <div className="flex items-center justify-between border-b border-black/10 px-4 py-2 text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400/70" />
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400/70" />
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400/70" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                    {previewCount} items
                  </span>
                  <button
                    type="button"
                    onClick={runPreviewFetch}
                    disabled={previewLoading}
                    className="inline-flex h-6 min-w-[92px] items-center justify-center rounded border border-black/20 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-700 transition hover:border-black/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {previewLoading ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden="true" />
                    ) : (
                      "Regenerate Preview"
                    )}
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 md:px-7">
                <div className="mt-4 flex items-center justify-between gap-3 border-b border-black/10 pb-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-200 text-sm font-bold text-rose-800">
                      C
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">CodaBool</p>
                      <p className="truncate text-xs text-slate-600">to {email || "you@example.com"}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl bg-white">
                  <iframe
                    title="newsletter-html-preview"
                    srcDoc={previewHtml || "<html><body style='font-family: Arial, sans-serif; padding: 20px; color: #334155;'>Waiting for preview...</body></html>"}
                    className="h-[520px] w-full"
                  />
                </div>
              </div>
            </section>
          </form>
        </section>

        <button
          type="button"
          onClick={openLooksGoodModal}
          className="mb-[20vh] mt-[12vh] inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-emerald-200/45 bg-emerald-300/15 px-5 py-4 text-base font-black uppercase tracking-[0.14em] text-emerald-100 transition hover:border-emerald-200/80"
        >
          Looks Good
        </button>
      </section>

      {isConfirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={resetConfirmModal}
        >
          <section
            className={[
              "relative w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-5 text-slate-100 shadow-[0_24px_56px_-24px_rgba(0,0,0,0.9)]",
              confirmStep === "existing" ? "h-[80vh]" : "max-h-[85vh]",
            ].join(" ")}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={resetConfirmModal}
              className="absolute right-[1em] top-[1em] inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/25 bg-slate-900 text-slate-200 transition hover:border-white/50"
              aria-label="Close dialog"
            >
              x
            </button>

            <div>
              {confirmStep === "notice" ? (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-cyan-100">Mind the Gap</h2>
                  <p className="text-lg text-slate-200">I made this project for myself</p>
                  <p className="text-lg text-slate-200 mt-2">The following are under represented</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">solo</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">larp</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">D&amp;D</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">Pathfinder</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">lyric games</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">diceless</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">gm-less</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">vtt</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">foundry-vtt</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">lancer</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">hexcrawl</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">AI assisted</span>
                  </div>
                  <p className="text-lg text-slate-300 mt-10">The following are over represented </p>
                  <div>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">horror</span>
                  </div>

                  {confirmError ? <p className="text-sm text-red-300">{confirmError}</p> : null}

                  <button
                    type="button"
                    onClick={handleAcknowledgeBias}
                    disabled={confirmLoading}
                    className="inline-flex min-w-[140px] items-center justify-center rounded-lg border border-cyan-200/45 bg-cyan-300/12 px-4 py-2 mt-10 w-full text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-200/75 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {confirmLoading ? "Checking..." : "Acknowledge"}
                  </button>
                </div>
              ) : null}

              {confirmStep === "existing" ? (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-amber-100">Existing Preferences Found</h2>
                  <textarea
                    readOnly
                    value={existingPreferenceText}
                    className="h-[65vh] w-full resize-none rounded-xl border border-white/20 bg-black/30 p-3 font-mono text-lg text-cyan-100"
                  />

                  {confirmError ? <p className="text-sm text-red-300">{confirmError}</p> : null}

                  <button
                    type="button"
                    onClick={handleReplaceExistingPreferences}
                    disabled={confirmLoading}
                    className="inline-flex min-w-[220px] items-center justify-center rounded-lg border w-full border-red-300/50 bg-red-400/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-100 transition hover:border-red-200/85 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {confirmLoading ? "Replacing..." : "Replace This"}
                  </button>
                </div>
              ) : null}

              {confirmStep === "saved" ? (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold uppercase tracking-[0.12em] text-emerald-100">Preferences Saved</h2>
                  <p className="text-sm text-slate-200">Your newsletter preferences were saved for this email.</p>
                  <button
                    type="button"
                    onClick={resetConfirmModal}
                    className="inline-flex min-w-[140px] items-center justify-center rounded-lg border border-emerald-200/50 bg-emerald-300/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-200/80"
                  >
                    Close
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
