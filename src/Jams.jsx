import { useMemo } from "react";

const JAM_ENTRIES = [
  {
    year: 2026,
    title: "TripTech3",
    url: "https://itch.io/jam/triptech3/entries",
    entries: 51,
    signal: "51 entries / 1,133 ratings",
    description: "Mothership trifolds",
  },
  {
    year: 2025,
    title: "TripTech2",
    url: "https://itch.io/jam/triptech2/entries",
    entries: 32,
    signal: "32 entries",
    description: "Mothership trifolds",
  },
  {
    year: 2025,
    title: "TripTech1",
    url: "https://itch.io/jam/triptech-game-jam-052025/entries",
    entries: 39,
    signal: "39 entries / 663 ratings",
    description: "Mothership trifolds",
  },

  {
    year: 2026,
    title: "Mini-Campaign",
    url: "https://itch.io/jam/2026-dg-mini-campaign-jam/entries",
    entries: null,
    signal: "ongoing",
    description: "Delta Green",
  },
  {
    year: 2025,
    title: "Mini-Campaign",
    url: "https://itch.io/jam/2025-dg-mini-campaign-jam/entries",
    entries: 9,
    signal: "9 entries",
    description: "Delta Green",
  },

  {
    year: 2024,
    title: "CABIN FEVER",
    url: "https://itch.io/jam/cabinfever/entries",
    entries: 125,
    signal: "125 entries",
    description: "Pirate Borg",
  },
  {
    year: 2021,
    title: "FOLK-LORE",
    url: "https://itch.io/jam/flk-lore/entries",
    entries: 125,
    signal: "125 entries",
    description: "MORK BORG",
  },
  {
    year: 2021,
    title: "Random Adventure",
    url: "https://itch.io/jam/random-adventure-jam/entries",
    entries: 111,
    signal: "111 entries",
    description: "variety",
  },
  {
    year: 2022,
    title: "Tales From The Void",
    url: "https://itch.io/jam/tales-from-the-void/entries",
    entries: 79,
    signal: "79 entries",
    description: "Liminal Horror",
  },
  {
    year: 2023,
    title: "Myths, Fables, and Folklore",
    url: "https://itch.io/jam/myths/entries",
    entries: 77,
    signal: "77 entries",
    description: "Folklore variety",
  },
  {
    year: 2022,
    title: "Forests of Another Name",
    url: "https://itch.io/jam/forests-of-another-name/entries",
    entries: 39,
    signal: "39 entries",
    description: "Cairn",
  },
  {
    year: 2023,
    title: "A Town, A Forest, A Dungeon",
    url: "https://itch.io/jam/a-town-a-forest-a-dungeon/entries",
    entries: 57,
    signal: "57 entries",
    description: "Cairn",
  },

  {
    year: 2025,
    title: "One-Page RPG",
    url: "https://itch.io/jam/one-page-rpg-jam-2025/entries",
    entries: 680,
    signal: "680 entries",
    description: "variety",
  },
  {
    year: 2024,
    title: "One-Page RPG",
    url: "https://itch.io/jam/one-page-rpg-jam-2024/entries",
    entries: 657,
    signal: "657 entries",
    description: "variety",
  },
  {
    year: 2023,
    title: "One-Page RPG",
    url: "https://itch.io/jam/one-page-rpg-jam-2023/entries",
    entries: 600,
    signal: "600 entries",
    description: "variety",
  },
  {
    year: 2022,
    title: "One-Page RPG",
    url: "https://itch.io/jam/one-page-rpg-jam-2022/entries",
    entries: 363,
    signal: "363 entries",
    description: "variety",
  },

  {
    year: 2025,
    title: "Tiny World",
    url: "https://itch.io/jam/tiny-world-ttrpg-jam/entries",
    entries: 274,
    signal: "274 entries",
    description: "8pg or less",
  },
  {
    year: 2021,
    title: "Tiny Tome",
    url: "https://itch.io/jam/tiny-tome-jam/entries",
    entries: 112,
    signal: "112 entries",
    description: "small-format TTRPGs",
  },

  {
    year: 2024,
    title: "The Adventures Continue",
    url: "https://itch.io/jam/mausritter-the-adventures-continue/entries",
    entries: 70,
    signal: "70 entries",
    description: "Mausritter",
  },
  {
    year: 2025,
    title: "Month Companion",
    url: "https://itch.io/jam/mausritter-month-game-jam/entries",
    entries: 61,
    signal: "61 entries",
    description: "Mausritter",
  },
  {
    year: 2022,
    title: "Megadungeon Mayhem of May",
    url: "https://itch.io/jam/mausritter-megadungeon-mayhem-of-may/entries",
    entries: 43,
    signal: "43 entries",
    description: "Mausritter",
  },
  {
    year: 2021,
    title: "November of NPCs",
    url: "https://itch.io/jam/mausritter-november-of-npcs/entries",
    entries: 48,
    signal: "48 entries",
    description: "Mausritter",
  },
  {
    year: 2023,
    title: "Spooky Season",
    url: "https://itch.io/jam/spooky-season-mauritter-game-jam/entries",
    entries: 36,
    signal: "36 entries",
    description: "Mausritter",
  },
  {
    year: 2022,
    title: "Winter Has Come",
    url: "https://itch.io/jam/winter-has-come-mausritter-game-jam/entries",
    entries: 35,
    signal: "35 entries",
    description: "Mausritter",
  },

  {
    year: 2020,
    title: "Eclectic Bastion",
    url: "https://itch.io/jam/eclectic-bastion-jam/entries",
    entries: 60,
    signal: "60 entries",
    description: "Into the Odd / Electric Bastionland",
  },
  {
    year: 2025,
    title: "Mythic Bastionland 1",
    url: "https://itch.io/jam/mythic-bastionland-jam/entries",
    entries: 98,
    signal: "98 entries",
    description: "Mythic Bastionland",
  },

  {
    year: 2024,
    title: "Horror of the Americas",
    url: "https://itch.io/jam/horror-of-the-americas-jam/entries",
    entries: 55,
    signal: "55 entries",
    description: "Liminal Horror",
  },
  {
    year: 2025,
    title: "Halloween Monster",
    url: "https://itch.io/jam/liminal-horror-halloween-monster-jam/entries",
    entries: 21,
    signal: "21 entries",
    description: "Liminal Horror",
  },
  {
    year: 2024,
    title: "Twisted Classics",
    url: "https://itch.io/jam/liminal-horror-twisted-classics-jam/entries",
    entries: 35,
    signal: "35 entries",
    description: "Liminal Horror",
  },
  {
    year: 2022,
    title: "Artifacts",
    url: "https://itch.io/jam/artifacts-of-horror-jam/entries",
    entries: 71,
    signal: "71 entries",
    description: "horror variety",
  },

  {
    year: 2025,
    title: "What We Didn't Know",
    url: "https://itch.io/jam/what-we-didnt-know-mork-borg-jam/entries",
    entries: 47,
    signal: "47 entries / 666 ratings",
    description: "MORK BORG",
  },
  {
    year: 2021,
    title: "THE END IS NEAR",
    url: "https://itch.io/jam/24-hour-misery/entries",
    entries: 45,
    signal: "45 entries",
    description: "MORK BORG",
  },
  {
    year: 2024,
    title: "The Nameless Scriptures Lore",
    url: "https://itch.io/jam/the-nameless-scriptures-jam/entries",
    entries: 60,
    signal: "60 entries",
    description: "MORK BORG",
  },

  {
    year: 2022,
    title: "OPS",
    url: "https://itch.io/jam/fist-jam-ops/entries",
    entries: 37,
    signal: "37 entries",
    description: "FIST",
  },
  {
    year: 2025,
    title: "Anniversary",
    url: "https://itch.io/jam/fist-anniversary-jam/entries",
    entries: 38,
    signal: "38 entries",
    description: "FIST",
  },
  {
    year: 2026,
    title: "OPS VI",
    url: "https://itch.io/jam/fist-jam-ops-vi/entries",
    entries: 22,
    signal: "22 entries",
    description: "FIST",
  },
  {
    year: 2024,
    title: "OPS V",
    url: "https://itch.io/jam/fist-jam-ops-v/entries",
    entries: 26,
    signal: "26 entries",
    description: "FIST",
  },
  {
    year: 2024,
    title: "OPS IV",
    url: "https://itch.io/jam/fist-jam-ops-iv/entries",
    entries: 27,
    signal: "27 entries",
    description: "FIST",
  },
  {
    year: 2023,
    title: "Ultra",
    url: "https://itch.io/jam/fist-ultrajam/entries",
    entries: 31,
    signal: "31 entries",
    description: "FIST",
  },
  {
    year: 2023,
    title: "OPS III",
    url: "https://itch.io/jam/fist-zine-month-jam/entries",
    entries: 30,
    signal: "30 entries",
    description: "FIST",
  },
  {
    year: 2022,
    title: "OPS II",
    url: "https://itch.io/jam/fist-mad-science-jam/entries",
    entries: 18,
    signal: "18 entries",
    description: "FIST",
  },

  {
    year: 2024,
    title: "CBR+PNK",
    url: "https://itch.io/jam/cbrpnk-jam-2024/entries",
    entries: 11,
    signal: "11 entries",
    description: "CBR+PNK",
  },
  {
    year: 2023,
    title: "URBN_LGND.exe",
    url: "https://itch.io/jam/urbn-lgndexe/entries",
    entries: 44,
    signal: "44 entries",
    description: "CY_BORG",
  },
  {
    year: 2022,
    title: "Monster Mash",
    url: "https://itch.io/jam/monster-mash-bogfolk/entries",
    entries: 58,
    signal: "58 entries",
    description: "BORG",
  },

  {
    year: 2025,
    title: "Trans Rights - Ohio",
    url: "https://itch.io/jam/ttrpgs-for-trans-rights-ohio-game-jam/entries",
    entries: 473,
    signal: "473 entries",
    description: "Bundle",
  },
  {
    year: 2024,
    title: "Trans Rights - West Virginia",
    url: "https://itch.io/jam/ttrpgs-for-trans-rights-west-virginia/entries",
    entries: 533,
    signal: "533 entries",
    description: "Bundle",
  },
  {
    year: 2026,
    title: "Trans Rights - Idaho",
    url: "https://itch.io/jam/ttrpgs-for-trans-rights-idaho/entries",
    entries: 525,
    signal: "525 entries",
    description: "Bundle",
  },
  {
    year: 2022,
    title: "Trans Rights - Florida",
    url: "https://itch.io/jam/ttrpgs-for-trans-rights-in-florida/entries",
    entries: 527,
    signal: "527 entries",
    description: "Bundle",
  },

  {
    year: 2024,
    title: "ttRPG Jamuary",
    url: "https://itch.io/jam/ttrpgjamuary/entries",
    entries: 89,
    signal: "89 entries",
    description: "variety",
  },
  {
    year: 2022,
    title: "Mini TTRPG",
    url: "https://itch.io/jam/minittrpgjam/entries",
    entries: 101,
    signal: "101 entries",
    description: "variety",
  },
];
// { rank: 17, year: 2025, title: "Folklore Jam 2025", url: "https://itch.io/jam/folklorejam25", signal: "71 entries", description: "Analogue folklore jam with lots of spooky, cryptid, mythic, and urban-legend material." },
// { rank: 8, year: 2025, title: "OSR June Jam", url: "https://itch.io/jam/osr-june-jam", signal: "117 entries", description: "Broad OSR/NSR jam for modules, bestiaries, items, NPCs, and rules hacks." },
// { rank: 18, year: 2025, title: "Hot Horror Jam", url: "https://itch.io/jam/hothorrorjam", signal: "70 entries", description: "Tabletop horror jam focused on intimate, supernatural, bodily, emotional, and social horror." },
// { rank: 29, year: 2024, title: "Folk-Horror Game Jam", url: "https://itch.io/jam/folk-horror", signal: "31 entries", description: "Folk horror jam open to any system, including MORK BORG and Wretched and Alone-style games." },
// { rank: 30, year: 2025, title: "Sci-Fi One-Shot Jam 2025", url: "https://itch.io/jam/sci-fi-one-shot-jam-2025", signal: "30 entries", description: "System-agnostic or system-specific sci-fi one-shot modules, very Mothership-adjacent." },
// { rank: 31, year: 2024, title: "Apocalypse Keys Jam", url: "https://itch.io/jam/monsters-of-the-apocalypse", signal: "30 entries", description: "Monster/apocalypse TTRPG jam with PbtA/FitD overlap and horror-friendly themes." },
// { rank: 32, year: 2024, title: "Triangle Agency Fan Zine", url: "https://itch.io/jam/triangle-agency-fan-zine", signal: "27 entries", description: "Small but very on-target if you want Triangle Agency and anomaly-office material." },
// { rank: 33, year: 2023, title: "A Miserable Dungeon Jam", url: "https://itch.io/jam/a-miserable-dungeon-jam-a-dungeon-most-fowl", signal: "25 entries", description: "MORK BORG community dungeon jam where each entry contributes a strange room or dungeon piece." },
// { rank: 34, year: 2023, title: "Sinners and Seamonsters Indie TTRPG Horror Jam", url: "https://itch.io/jam/sinners-and-seamonsters-jam", signal: "24 entries", description: "Specific biblical and maritime horror jam with full games, playbooks, enemies, and hacks." },
// { rank: 35, year: 2023, title: "Are You Afraid in the Dark?", url: "https://itch.io/jam/are-you-afraid-in-the-dark", signal: "23 entries", description: "Forged in the Dark horror jam for playable hacks, supplements, and survival and monster-hunting material." },
// { rank: 36, year: 2026, title: "Cyberpunk Mission Jam 2026", url: "https://itch.io/jam/cyberpunk-mission-jam-2026", signal: "21 entries / 115 ratings", description: "Mission and adventure jam for cyberpunk TTRPGs, including Cy_Borg, CBR+PNK, and Cities Without Number." },
// { rank: 37, year: 2023, title: "Eureka Mystery Module Jam", url: "https://itch.io/jam/eureka-mystery-module-jam", signal: "14 entries", description: "Small but highly relevant investigation jam built around actual mystery adventure modules." },
// { rank: 38, year: 2025, title: "Carved From Brindlewood Winter Jam 2025", url: "https://itch.io/jam/carved-from-bindlewood-jam-2025", signal: "15 entries", description: "Brindlewood-focused jam for mysteries, games, supplements, and related material." },
// { rank: 40, year: 2024, title: "Liminal Horror Halloween Monster Jam", url: "https://itch.io/jam/liminal-horror-halloween-monster-jam", signal: "21 entries", description: "Focused Liminal Horror monster jam for spooky, modern-horror creature material." },


const AWARDS = [
  {
  year: 2026,
  title: "ENNIE",
  url: "https://ennie-awards.com/2026-nominees/",
  description: "Award nominees",
  signal: "",
},
  {
    year: 2025,
    title: "ENNIE",
    url: "https://ennie-awards.com/portfolio-item/2025-nominees-and-winners/",
    description: "Award",
    signal: "",
  },
  {
    year: 2024,
    title: "ENNIE",
    url: "https://ennie-awards.com/portfolio-item/2024-nominees-and-winners/",
    description: "Award",
    signal: "",
  },
    {
    year: 2023,
    title: "ENNIE",
    url: "https://ennie-awards.com/portfolio-item/2023-nominees-and-winners/",
    description: "Award",
    signal: "",
  },
    {
    year: 2022,
    title: "ENNIE",
    url: "https://ennie-awards.com/portfolio-item/2022-nominees-and-winners/",
    description: "Award",
    signal: "",
  },
    {
    year: 2021,
    title: "ENNIE",
    url: "https://ennie-awards.com/portfolio-item/2021-nominees-and-winners/",
    description: "Award",
    signal: "",
  },
  {
    year: 2024,
    title: "CRITS",
    url: "https://docs.google.com/document/d/1slfaVQ9pWKViZwT0JEaB-2uO5Sm0innGVVN_a2xCsw8",
    description: "Award",
    signal: "",
  },
  {
    year: 2023,
    title: "CRITS",
    url: "https://docs.google.com/document/d/1DQ6LEjqMPpwXXmzjdHqne-i8VQ_8VD4ndHIlHiHMJqk",
    description: "Award",
    signal: "",
  },
];

const YEAR_ORDER = [2026, 2025, 2024, 2023, 2022, 2021];

export default function Jams({ onBack }) {
  const groups = useMemo(() => {
    return YEAR_ORDER.map((year) => ({
      year,
      entries: [
        ...JAM_ENTRIES.filter((entry) => entry.year === year).map((entry) => ({
          ...entry,
          isAward: false,
        })),
        ...AWARDS.filter((entry) => entry.year === year).map((entry) => ({
          ...entry,
          isAward: true,
        })),
      ],
    })).filter((group) => group.entries.length > 0);
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,.15),transparent_45%),radial-gradient(circle_at_95%_20%,rgba(245,158,11,.18),transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] px-4 pb-12 pt-8 text-slate-100 md:px-8">
      <section className="mx-auto w-full max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-white/25 cursor-pointer bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 transition hover:border-white/45"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Discover
          </button>
          <h1 className="text-lg font-bold uppercase tracking-[0.14em] text-cyan-100 md:text-xl">Jams</h1>
        </div>

        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.year}>
              <div className="mb-3 flex items-end gap-3">
                <h2 className="text-2xl font-black tracking-tight text-amber-300 md:text-3xl">{group.year}</h2>
              </div>
              <div className="mb-4 h-px w-full bg-gradient-to-r from-amber-300/70 via-cyan-300/20 to-transparent" />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.entries.map((jam) => (
                  <a
                    key={`${jam.year}-${jam.title}-${jam.url}`}
                    href={jam.url}
                    target="_blank"
                    rel="noreferrer"
                    className={[
                      "group rounded-xl border p-2.5 transition",
                      jam.isAward
                        ? "border-amber-200/14 bg-[linear-gradient(135deg,rgba(245,158,11,0.08)_0%,rgba(245,158,11,0.03)_45%,rgba(2,6,23,0.52)_100%)] hover:border-amber-100/24"
                        : "border-white/10 bg-slate-950/50 hover:border-cyan-200/40 hover:bg-slate-900/65",
                    ].join(" ")}
                  >
                    <h3 className="line-clamp-2 text-md font-bold leading-snug text-amber-100 transition group-hover:text-cyan-100">{jam.title}</h3>

                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-md leading-relaxed text-slate-300">{jam.description}</p>

                      {jam.signal !== "" ? (
                        <span className="shrink-0 rounded-full border border-white/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {jam.entries != null ? `${jam.entries} entries` : "ongoing"}
                        </span>
                      ) : null}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
