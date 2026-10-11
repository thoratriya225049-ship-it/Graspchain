# Graspchain redesign — "clear water, deep ink"

Scope: `apps/web` only. No API, data shape or route was removed; three routes were added
(`/attempts/[id]/proof`, `/research/rate`, `/credits`). Everything below is implemented.

## 1. Audit

| Screen / element | Before | Now | Where it went |
|---|---|---|---|
| Dark system strip (judge / LLM / chain) on every page | Primary, everyone | **Move** | Quiet "System" popover with a status dot (header, all pages); full panel in Admin → System status |
| Crimson "API not reachable" banner | Primary | **Move** | Inline "Can't reach the server · Retry" under the header, amber dot |
| Demo roster table on Sign in | Primary | **Secondary** | Per-role shortcuts inside the role picker + "Try a demo" drawer |
| Home "What this deployment is running" | Primary | **Secondary** | System popover; cta-4 device shows the same real values |
| Home "How a score is made" paragraphs | Primary | Primary, shortened | Pipeline row, one line per stage |
| Result: score, band | Primary | Primary | Score panel (rolling number) |
| Result: one-line summary, understood, missed/misread, next step | Primary | Primary | In that order, one column |
| Result: four dimension meters, score construction table, scale | Primary | **Secondary** | "How this score was made" disclosure |
| Result: judge/claims/fair entry/clock/time-to-score facts, flags | Primary | **Secondary** | Same disclosure |
| Result: integrity panel, evidence trail | Primary | **Secondary** | "Assessment conditions", "Evidence trail" disclosures (a non-certified outcome stays visible as a calm notice) |
| Result: receipt box, QR, download, lineage | Primary | **Move** | New Proof screen |
| X-Ray: legend, key-idea sidebar, claims sidebar | Primary | **Secondary** | Lenses (Claims / Coverage / Misreadings), Evidence Inspector drawer |
| Reading: red low-time bar | Primary | Changed | Calm FairClock ring + plain words, never red |
| Writing: integrity explainer paragraph | Primary | **Secondary** | "Assessment conditions" timeline (collapsed) |
| Gate: five numbered paragraphs | Primary | Shortened | Four short steps |
| Desk: stats row, fingerprint, ledger beside the recommendation | Primary | **Secondary** | Below the single recommended-article panel |
| Progress: four-line chart with grid, retries | Primary | **Secondary** | One trend line (no grid) up top; chart and retries in disclosures |
| Teacher: three tables | Primary | Split | "Next up" + one list; search and corrected behind disclosures; split view per item with "Next in queue" |
| Research: blind rating inside the stats page | Primary | **Move** | Own calm route `/research/rate` |
| Admin: one long page | Primary | Split | Sub-screens: System status · Live modes · Integrity tools · Audit log |

## 2. Screen map (one purpose, one primary action)

| Screen | Purpose | Primary action |
|---|---|---|
| `/` Home (signed out) | Say what Graspchain proves | Sign in |
| `/login` | Get in as the right role | Sign In / Create ID |
| `/verify` | Answer "was this changed?" | Verify |
| `/verify/[id]` | Full record of one verification | Check independently |
| `/consent` | Agree to how work is handled | I understand and agree |
| `/home` Desk | Start the next reading | Start reading |
| `/library` | Pick any article | Start |
| `/start/[id]` Gate | Enter fairly | Open the article |
| `/session/[id]` Read | Read once | (FairClock) / I'm done reading |
| `/session/[id]` Answer | Explain it | Submit for assessment |
| `/attempts/[id]` Result | Understand the result | Open X-Ray |
| `/attempts/[id]/xray` | See the evidence | (explore claims) |
| `/attempts/[id]/proof` | Hold the proof | Verify independently |
| `/progress` | See the trend | Start reading (recommendation) |
| `/teacher` → `/teacher/[id]` | Decide one item | Record correction |
| `/research/rate` | Rate blind | Score 1–10 |
| `/admin` | Run the deployment | Save changes (Live modes) |

## 3. Effect map (at most one signature effect per screen)

| Screen | Signature effect | Why | Off / simplified when |
|---|---|---|---|
| Home hero | 3D perspective headline with the largest word as Video Text (ink loop) + parallax product fragments | First impression; the product's idea (clarity through water) in the type itself | Touch: no tilt/parallax. Reduced motion / low power / no VP9: poster fill, static layers |
| Home, below the fold | Chain Flow story (~6 s, replayable), one Colourful word, outlined marquee | Explains the chain once | Reduced motion: final state, static marquee. Offscreen: paused |
| Home close | Watermelon cta-4 (device rises on hover) | Faithful block | — |
| Sign in | Skiper52 expand-on-hover role picker; hashing proof with Decrypting Text | Choosing a role is the decision on this screen; privacy made tangible | Touch: tap to expand |
| Verify | Beams with collision → seal | Turns a check into a ceremony with a clear end | Failure: beams stop, nothing celebrates. Reduced motion: no beams |
| Result | **None** except the score rolling up once | The result must stay calm | Reduced motion: plain number |
| X-Ray | Thread drawing (350 ms) on hover/focus; 2° panel tilt | The engagement is the exploration | Phones: stacked, inline expansion, no threads |
| Proof | Receipt slip, curved seal turns once, hash decrypts once, ≤4° tilt | The one object worth holding | Touch/reduced: flat, no spin |
| Journey (Gate → Read → Answer → Result → X-Ray → Proof) | Thread rail Sky → Aqua → Teal → Abyss | Shows where you are in Understand → Evidence → Decision → Proof | Narrow screens: inline four-step bar |
| Everything else | None — 200–400 ms fades and the route rise only | — | — |

Global: `MotionConfig reducedMotion="user"`; CSS kills animations under `prefers-reduced-motion`; effects use IntersectionObserver to pause offscreen; `useCalm()` treats ≤2 cores, ≤2 GB, Save-Data or 2G/3G as low power.

## 4. Tokens (`apps/web/src/app/globals.css`)

- **Brand (exact):** Abyss `#0B3A4A` · Teal `#12708A` · Aqua `#6ACCC6` · Mint `#DAF3F2` · Sky `#AEDFF7` · Periwinkle `#B0BCE3` · Lavender `#AB9BCB`.
- **Derived:** Paper `#F7FCFC`, Ink `#0B3A4A`, Secondary `#3F6672`, Tertiary `#4F7682`, Hairline Abyss 10% (strong 22%), text on dark `#EAF8F7`, secondary on dark `#8FB4BB`, raised Abyss `#0F4556`.
- **Status:** mark (small areas) emerald `#2FA37A` · amber `#E3A93A` · coral `#E0644F`. Text tints added because the marks fail as text on Paper (3.05 / 2.03 / 3.32:1): `#1D7A58` 5.10 · `#8A5A07` 5.72 · `#B43F2C` 5.50. On Abyss: `#5FD3A5` 6.60 · `#E3A93A` 5.82 · `#FF8A75` 5.32.
- **Stages:** Understand = Sky, Evidence = Aqua, Decision = Teal, Proof = Abyss; thread `--thread` / `--thread-x`. Two voices: source = teal family, student = lavender family (`.voice-student`, lavender rules and washes).
- **Dark surfaces:** `.on-abyss` re-points the same tokens, so components work unchanged on Abyss.
- **Type:** Fraunces (display, opsz), Geist (UI), Geist Mono (IDs, hashes). Scale 12 / 14 / 16 / 20 / 28 / 40 / 56 / 80 / 160.
- **Radii:** 6 · 10 · 14 · 20 · 28 · 36; buttons 12–16; pills full.
- **Shadows:** `lift`, `doc`, `float` — large, soft, ≤ 0.55 alpha, used sparingly.
- **Motion:** `--ease-water: cubic-bezier(0.22, 0.8, 0.2, 1)`; 200 / 320 / 400 ms.
- **Measured contrast:** white on Teal 5.66 (primary button), Ink on Paper 11.8, Ink on Mint 10.5, Teal on Paper 5.47, Abyss on Sky 8.55 / Aqua 6.44 / Periwinkle 6.49 / Lavender 4.82.

## 5. Rationale and deviations

- **The source is not "one tap away" while answering.** The brief asked for it; the product's core rule is that the article closes for good and the server refuses to send it again (403, recorded as an integrity event). Re-showing it would break fairness and the integrity record. Instead, "How to answer well" sits one tap away, and the student's text carries the lavender voice. Highlight-to-attach evidence was not built for the same reason.
- **"Request class access" form omitted.** There is no backend for it; a form that sends nothing would be dishonest. Pipeline row and a short fairness editorial were kept.
- **Colourful Text** appears once (home, the word "check" on Abyss). Teal is left out of its cycle because Teal on Abyss is ~2.1:1.
- **Video Text** uses a loop generated in this repo (`apps/web/scripts/render-ink-loop.mjs`, WebGL shader → VP9 WebM, 723 KB, poster 80 KB). Clipped by an SVG `clipPath` drawn with the page's own font (a data-URI mask can't use webfonts); the real word stays in the DOM, filled with the poster via `background-clip:text`.
- **Independent verification runs in-page** (`lib/rpc.ts`): JCS + SHA-256 in the browser, then `records`, `verify` and `AssessmentSuperseded` logs over the configured public RPC. It never calls the Graspchain API. The static verifier stays linked for pasting JSON or changing RPC.
- **Role picker:** hover/focus *previews* a role (expands it); click/Enter *chooses* it, so the form doesn't jump while the pointer passes over. Admin can't create IDs (the API only registers students and teachers), so "Create New ID" hides for Admin.
- **Chain Flow on the home page** uses article A1 and its prepared demo answer, labelled as an example; the hash on the slip is a real SHA-256 of that example.
- **Score segments** weight each key idea by its rubric weight; "missed or misread" groups missed and misunderstood (both coral), each with its word and glyph.
- **cta-4:** layout, structure, proportions, spacing, type scale and the hover lift are the registry item's. Changed: copy, colour tokens (primary → Teal, zinc frame → Abyss, emerald/rose deltas → status dots with words), react-icons → the app's icon set, demo metrics → this deployment's real configuration. Added: the secondary "Verify a receipt" link.

## 6. External components

| Component | License / terms | Used for |
|---|---|---|
| Watermelon UI — CTA Section 4 (`registry.watermelon.sh/r/cta-4.json`) | MIT | Home closing CTA |
| Skiper UI — skiper52, skiper28, skiper88/27 | Free version, attribution required (on `/credits`) | Role picker, hero tilt, score roll |
| Aceternity UI — Colourful Text, Parallax Hero Images, Background Beams With Collision, Tracing Beam, 3D Card, Wispr Flow Text (Labs) | Free components | Home, Verify, journey thread, receipt/X-Ray tilt, marquee |
| Sera UI — Curved Text, Video Text, Decrypting Text, Number Ticker | MIT | Seal, hero word, hashes, score |
| Motion 13.4.3 | MIT | Animation runtime |
| Fraunces, Geist, Geist Mono | SIL OFL 1.1 | Type |

All were rebuilt in Graspchain's tokens; none of their copy or assets is used. Credits are listed at `/credits`, linked from every footer.

## 7. Bundle impact (production build, gzip)

- `motion` runtime: one shared chunk, **42.5 KB**. It is loaded app-wide because the reduced-motion provider and the journey thread use it.
- Effect components are small on top of the runtime: home hero, chain flow and cta-4 ship with the home route; the Verify chunk (ceremony, beams, shared hashing and V1–V4 checks) is ~45 KB; the X-Ray + Result chunk is ~14 KB.
- Media: the ink loop (723 KB) is requested only on the home page, only when it is on screen and allowed to move; otherwise the 80 KB poster.
- No new runtime dependency beyond `motion`. Recharts was already present and still loads only on the Progress and Research routes.

## 8. Checked

- `tsc --noEmit`, ESLint and Prettier clean; `next build` succeeds (21 routes).
- **E2E: all 12 Playwright specs pass** against the full local stack. Selectors were updated where the UI moved: "See it on the article" → "Open X-Ray"; the X-Ray keyboard path now opens the Evidence Inspector; receipt download and "verify this record" moved to the Proof screen; "How this number was made" → "How this score was made".
- Walked in a real browser: home (desktop, phone, reduced motion), sign in (desktop, phone), both verification modes end to end against the local chain, result, X-Ray (thread, lenses, phone layout), proof, gate, reading, writing, desk, progress, teacher queue and item, admin, research.
