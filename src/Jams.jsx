import { useMemo } from "react";

const JAM_ENTRIES = [
  { rank: 2, year: 2026, title: "TripTech", url: "https://itch.io/jam/triptech3/entries", signal: "51 entries / 1,133 ratings", description: "Mothership trifolds" },
  { rank: 6, year: 2025, title: "CABIN FEVER", url: "https://itch.io/jam/cabinfever/entries", signal: "125 entries", description: "Pirate Borg" },
  { rank: 7, year: 2025, title: "FOLK-LORE", url: "https://itch.io/jam/flk-lore/entries", signal: "125 entries", description: "MORK BORG" },
  // { rank: 8, year: 2025, title: "OSR June Jam", url: "https://itch.io/jam/osr-june-jam", signal: "117 entries", description: "Broad OSR/NSR jam for modules, bestiaries, items, NPCs, and rules hacks." },
  { rank: 9, year: 2025, title: "Random Adventure", url: "https://itch.io/jam/random-adventure-jam/entries", signal: "111 entries", description: "variety" },
  { rank: 12, year: 2025, title: "Tales From The Void", url: "https://itch.io/jam/tales-from-the-void/entries", signal: "79 entries", description: "Liminal Horror" },
  { rank: 13, year: 2025, title: "Myths, Fables, and Folklore", url: "https://itch.io/jam/myths/entries", signal: "77 entries", description: "Folklore variety" },
  // { rank: 17, year: 2025, title: "Folklore Jam 2025", url: "https://itch.io/jam/folklorejam25", signal: "71 entries", description: "Analogue folklore jam with lots of spooky, cryptid, mythic, and urban-legend material." },
  // { rank: 18, year: 2025, title: "Hot Horror Jam", url: "https://itch.io/jam/hothorrorjam", signal: "70 entries", description: "Tabletop horror jam focused on intimate, supernatural, bodily, emotional, and social horror." },
  { rank: 19, year: 2024, title: "The Adventures Continue", url: "https://itch.io/jam/mausritter-the-adventures-continue/entries", signal: "70 entries", description: "Mausritter" },
  { rank: 21, year: 2024, title: "Mausritter Month", url: "https://itch.io/jam/mausritter-month-game-jam/entries", signal: "61 entries", description: "Mausritter" },
  { rank: 22, year: 2024, title: "Eclectic Bastion", url: "https://itch.io/jam/eclectic-bastion-jam/entries", signal: "60 entries", description: "Into the Odd / Electric Bastionland" },
  { rank: 23, year: 2024, title: "Horror of the Americas", url: "https://itch.io/jam/horror-of-the-americas-jam/entries", signal: "55 entries", description: "Liminal Horror" },
  { rank: 24, year: 2024, title: "What We Didnt Know", url: "https://itch.io/jam/what-we-didnt-know-mork-borg-jam/entries", signal: "47 entries / 666 ratings", description: "Mork Borg" },
  { rank: 25, year: 2025, title: "TripTech", url: "https://itch.io/jam/triptech-game-jam-052025/entries", signal: "39 entries / 663 ratings", description: "Mothership trifolds" },
  { rank: 25, year: 2025, title: "Forests of Another Name", url: "https://itch.io/jam/forests-of-another-name/entries", signal: "new", description: "Cairn" },
  { rank: 25, year: 2025, title: "A Town, A Forest, A Dungeon", url: "https://itch.io/jam/a-town-a-forest-a-dungeon/entries", signal: "new", description: "Cairn" },
  { rank: 26, year: 2024, title: "FIST: JAM OPS", url: "https://itch.io/jam/fist-jam-ops/entries", signal: "37 entries", description: "FIST" },
  { rank: 26, year: 2024, title: "CBR+PNK", url: "https://itch.io/jam/cbrpnk-jam-2024/entries", signal: "new", description: "CBR+PNK" },
  { rank: 27, year: 2023, title: "Spooky Season", url: "https://itch.io/jam/spooky-season-mauritter-game-jam/entries", signal: "36 entries", description: "Mausritter" },
  { rank: 28, year: 2024, title: "Twisted Classics", url: "https://itch.io/jam/liminal-horror-twisted-classics-jam/entries", signal: "35 entries", description: "Liminal Horror" },
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
  { rank: 39, year: 2026, title: "Mini-Campaign", url: "https://itch.io/jam/2026-dg-mini-campaign-jam/entries", signal: "9 entries", description: "Delta Green" },
  { rank: 39, year: 2025, title: "Mini-Campaign", url: "https://itch.io/jam/2025-dg-mini-campaign-jam/entries", signal: "9 entries", description: "Delta Green" },
  { rank: 39, year: 2025, title: "ENNIE", url: "https://ennie-awards.com/portfolio-item/2025-nominees-and-winners/", signal: "awards list", description: "Awards" },
  { rank: 39, year: 2024, title: "ENNIE", url: "https://ennie-awards.com/portfolio-item/2024-nominees-and-winners/", signal: "awards list", description: "Awards" },
  { rank: 39, year: 2024, title: "CRITS", url: "https://docs.google.com/document/d/1slfaVQ9pWKViZwT0JEaB-2uO5Sm0innGVVN_a2xCsw8", signal: "awards list", description: "Awards" },
  { rank: 39, year: 2023, title: "CRITS", url: "https://docs.google.com/document/d/1DQ6LEjqMPpwXXmzjdHqne-i8VQ_8VD4ndHIlHiHMJqk", signal: "awards list", description: "Awards" },
  // { rank: 40, year: 2024, title: "Liminal Horror Halloween Monster Jam", url: "https://itch.io/jam/liminal-horror-halloween-monster-jam", signal: "21 entries", description: "Focused Liminal Horror monster jam for spooky, modern-horror creature material." },
  { rank: 3, year: 2025, title: "One-Page RPG", url: "https://itch.io/jam/one-page-rpg-jam-2025/entries", signal: "680 entries", description: "variety" },
  { rank: 5, year: 2025, title: "Tiny World", url: "https://itch.io/jam/tiny-world-ttrpg-jam/entries", signal: "174 entries", description: "8pg or less" },
  { rank: 26, year: 2023, title: "URBN LGND.EXE", url: "https://itch.io/jam/urbn-lgndexe/entries", signal: "new", description: "CY_BORG" },
  { rank: 26, year: 2022, title: "Monster Mash", url: "https://itch.io/jam/monster-mash-bogfolk/entries", signal: "new", description: "BORG" },
  { rank: 26, year: 2022, title: "Trans Rights in Florida", url: "https://itch.io/jam/ttrpgs-for-trans-rights-in-florida/entries", signal: "new", description: "variety" },
];

const YEAR_ORDER = [2026, 2025, 2024, 2023, 2022];

export default function Jams({ onBack }) {
  const groups = useMemo(() => {
    return YEAR_ORDER.map((year) => ({
      year,
      entries: JAM_ENTRIES.filter((entry) => entry.year === year),
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
            Back to Feed
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
                    key={jam.rank}
                    href={jam.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border border-white/10 bg-slate-950/50 p-3 transition hover:border-cyan-200/40 hover:bg-slate-900/65"
                  >
                    {/* <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[9px]">{jam.signal}</span>
                    </div> */}

                    <h3 className="line-clamp-2 text-md font-bold leading-snug text-amber-100 transition group-hover:text-cyan-100">{jam.title}</h3>
                    <p className="mt-2 line-clamp-3 text-lg leading-relaxed text-slate-300">{jam.description}</p>
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
