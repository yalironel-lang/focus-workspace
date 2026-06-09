# Mission Control Design Specification

**Status:** Locked — ready for wireframe production  
**Version:** 1.1  
**Scope:** Mission Control (course anteroom) only. Workspace delegate strip included where warm-return bypass applies.

**V1.1 changes:** Model 2 storage band (Setup · Active · Library); Mess Detector as Setup rules; Course Resources + Memory Timeline inside Library cabinet; explicit non-goals.

---

## Locked decisions (do not revisit)

| Decision | Definition |
|----------|------------|
| Environment | Identity — MC is a place you enter |
| Briefing | Interaction model — one continuation, one primary action |
| Mission Control | Course anteroom / re-entry surface |
| Workspace | Primary work surface |
| Continuation | Single unified ranker; MC monument and Workspace strip share output |
| Routing | First visit + cold return → MC; warm return (<4h + active study session) → Workspace |
| Winning layout | Concept B (Environment-first zones) + Concept A hierarchy and typography |

---

# PART 1 — THE ROOM

## Mission Control as a place

Mission Control is the **course anteroom**: a small, stable room you step into before crossing into the work chamber (Workspace). It is not a dashboard, not a content library, and not the canvas. It is the course’s **presence at rest** — the desk left as you last left it, the doorways to external tools on the wall, and the storage you can reach without opening the workshop.

### What makes it feel like entering a course?

1. **Course name anchors the room.** The moment you arrive, you know which course you are in — not which app section, which tab, or which database.
2. **The desk is already set up (or clearly empty).** Continuation is physical metaphor: something was in progress, or the desk is explicitly unfurnished. You never land on a generic template.
3. **You stand outside the work surface.** The layout communicates: orientation happens here; manipulation happens elsewhere. The desk zone frames continuation; it does not embed the canvas.
4. **Periphery holds infrastructure.** Moodle, dates, and cabinets exist at the edges — felt, not read — like doorways and a clock, not a widget grid.
5. **One invitation to cross the threshold.** A single primary action resumes or enters work. The room does not ask you to prioritize among equals.

### What is permanent?

These elements define the room across all courses and all sessions:

| Permanent element | Role |
|-------------------|------|
| **Three-zone layout** | Periphery (top/side) → Desk zone (center) → Storage band (bottom, recessed) |
| **Desk zone frame** | Proportional enclosure that holds L0 whisper + L1 monument + primary CTA |
| **Zone grammar** | Same spatial logic on desktop and mobile; only proportions change |
| **Typography roles** | Course title, L0 whisper, monument label, monument title, monument context, CTA |
| **Cabinet triggers** | Collapsed L2 drawers in storage band — never expanded by default on arrival |
| **Single primary CTA** | Always one filled action inside desk zone |
| **Shell tabs** | Workspace \| Mission Control \| Studio remain peer navigation (routing is asymmetric; tabs are symmetric) |

### What changes between courses?

| Variable | Source |
|----------|--------|
| Course title and optional icon | Course metadata |
| Accent color | Course customization or derived progress tone (decorative only) |
| Periphery links | Course-scoped portals |
| Periphery dates | Course deadlines and exam |
| Monument content | Unified ranker output for that course |
| Cabinet counts | Active items, setup gaps (Mess Detector) |
| Storage band labels | Fixed: Setup · Active · Library |

The **room structure never changes**. Only the course’s state fills the room.

### What changes between states?

| State dimension | What changes |
|-----------------|--------------|
| Orientation whisper (L0) | Copy tone and content |
| Monument label | CONTINUE / RETURN TO / START / RESUME |
| Monument title and context | Ranker output |
| Primary CTA label and target | Crosses threshold per state |
| Cabinet default expansion | Setup may auto-expand on new course only |
| Periphery emphasis | Exam week: date line slightly stronger — never alarm chrome |
| Landing surface | Warm return: user on Workspace; MC tab shows mirrored ranker if opened |

### What remains visually stable across 500 sessions?

| Stable | Why |
|--------|-----|
| Zone proportions | User never relearns layout |
| Desk zone as visual anchor (~45–50% above-fold weight) | Continuation always in the same place |
| Monument-before-action read order | Briefing discipline |
| Collapsed cabinets on arrival | No accumulation of visible lists |
| Recessed storage band | Tasks/shelf never shout on entry |
| No progress %, panic banners, or Do-next strips above fold | Dashboard creep structurally forbidden |

The room **ages through copy and counts**, not through new UI species.

---

# PART 2 — THE DESK

## The continuation monument

The desk zone contains the **continuation monument**: the single authoritative statement of where the user’s thinking paused.

### Exact purpose

1. **Name cognitive state** — what the user was doing, in human study language (not file paths or JSON).
2. **Offer one continuation** — the ranker’s top output only; never a list of competing next actions.
3. **Host one primary action** — the threshold crossing into Workspace or restored study session.
4. **Earn trust** — by reflecting real session/memory signals, not heuristics presented as certainty.

The monument is **read before act**. Users scan title and context, then reach for the CTA.

### Information hierarchy (top to bottom, inside desk zone)

| Level | Role | Typography (Concept A) |
|-------|------|------------------------|
| **L0 — Orientation whisper** | One line: temporal + course context | 13px, weight 450, muted `#64748b`, max ~15 words, above desk frame or top inside frame |
| **Monument label** | Verb category | 10px, weight 750, uppercase, letter-spacing 0.1em, accent @ 70% — e.g. CONTINUE |
| **Monument title** | Primary artifact | 22–26px desktop / 20–22px mobile, weight 600, `#e2e8f0` — e.g. Solow Model · Question 7 |
| **Monument context** | Where in material | 13px, weight 450, `#64748b` — e.g. Final Exam 2023 · Page 4 · Work notebook · Block 12 |
| **Monument meta** | When last active | 11px, weight 450, `#374151` — e.g. Last active yesterday at 11:42pm |
| **Primary CTA** | Threshold action | 12px, weight 700, filled accent — one button |
| **Secondary action** | Ghost text link only | 11–12px, muted — max one, below CTA — e.g. Open workspace → |

### Required elements (cold return with continuation)

- L0 whisper
- Monument label
- Monument title
- Primary CTA (label reflects ranker action)

### Optional elements (include when ranker provides data)

- Monument context (page, block, paired notebook)
- Monument meta (relative last-active time)
- Secondary ghost link (never equal weight to primary CTA)

### What must never appear inside the desk zone

- Progress bars or percentages
- Task lists or checkboxes
- Multiple CTAs of equal visual weight
- “Do next” strips or lane names as hero content
- Panic banners or red exam countdown UI
- Live Workspace preview thumbnails (Concept C rejected)
- Inverted command block larger than monument (Concept D rejected)
- File extensions, raw filenames, or storage paths as title
- Second continuation candidate (“Also consider…”)

### Why users trust it

1. **Single source** — same ranker output as Workspace delegate strip on warm bypass.
2. **Honest specificity** — shows page/block/session when known; generic copy when not (“Open workspace”) without pretending precision.
3. **Stable location** — always inside desk zone; never moves between sessions.
4. **Read-then-act order** — title confirms memory before button commits.
5. **Failure mode transparency** — empty states say desk is clear; never show wrong continuation over silence.

---

# PART 3 — THE PERIPHERY

## Zone map

```
┌─ PERIPHERY ─────────────────────────────────────────────┐
│  Course · context chip          [Workspace] [MC] [Studio]│
├─────────────────────────────────────────────────────────┤
│  ┌─ DESK ZONE ───────────────────────────────────────┐  │
│  │  (monument — Part 2)                               │  │
│  └───────────────────────────────────────────────────┘  │
├─ STORAGE BAND (recessed) ───────────────────────────────┤
│  ▸ Setup (n)   ▸ Active (n)   ▸ Library                  │
│  ─ ─ ─ below fold ─ ─ ─                                 │
│  tasks · capture · shelf (L3 — existing work surface)   │
└─────────────────────────────────────────────────────────┘
```

Desktop: periphery includes **left rail** for Links + Dates (248px, darker `#070b14`). Main column holds desk + storage band.  
Mobile: links + dates compress to one row below desk zone.

---

## Links (doorways)

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | External tools (Moodle, Drive, ChatGPT, WhatsApp, email) are infrastructure, not mission direction. |
| **When it appears** | Always in periphery on desktop (left rail). Mobile: compact row after desk zone. |
| **Visual importance** | **Low.** 12px muted links with exit affordance (↗). Never compete with monument. |
| **Failure modes** | Too prominent → distraction dashboard. Duplicated in monument → split attention. Empty rail → show inline “+ Add Moodle” on new course only. |

---

## Dates (clock on the wall)

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | Temporal orientation without hero urgency. |
| **When it appears** | Periphery always; exam date may echo in L0 whisper. |
| **Visual importance** | **Low–medium.** Exam week: next deadline slightly brighter text — never red badges or banners. |
| **Failure modes** | Dates drive panic UI → violates briefing. Dates duplicated in monument → noise. Sorted list of 6+ items above fold → LMS creep. Cap visible periphery dates at 3–4; rest in Library Schedule section when expanded. |

---

## Active cabinet

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | Glanceable access to continuation-adjacent artifacts without opening canvas. Separate from Library catalog. |
| **When it appears** | Collapsed trigger: `▸ Active (n)`. Expanded on user tap only — never on cold arrival. Hidden when `n = 0` (new course). |
| **Visual importance** | **Low on arrival; medium when expanded.** Max 5 items. Groups: On your desk · Nearby · Needs review. |
| **Failure modes** | Becomes flat list (8+ rows) → dashboard. Auto-expand on arrival → HQ creep. Duplicates Library Resources rows → user confusion. |

---

## Setup cabinet (Course Setup + Mess Detector)

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | **Course Setup:** onboarding checklist for new/empty courses. **Mess Detector:** rule-based gap detection surfaced as invitation rows — no standalone detector UI, no score. |
| **When it appears** | Collapsed by default except **New Course** (auto-expanded once). Max **2 visible gaps** when expanded; rest behind “+N more”. |
| **Visual importance** | **Low default; medium on new course.** ○ circle invitations, not ⚠ warnings. |
| **Failure modes** | Non-dismissible nag loop → shame. Blocking monument → violates threshold. More than 2 visible gaps → checklist app. Branded “Mess Detector” panel → rejected. |

### Mess Detector rules (V1.1)

Detection only — output is Setup rows:

| Rule | Trigger |
|------|---------|
| No exam date | `section.exam_date` null |
| No Moodle link | No course-scoped moodle portal |
| No PDF/studyfile on canvas | Zero pdf/studyfile objects |
| Exams lane empty | Supabase Exams group has 0 items |
| Isolated note | Unlinked note <24h (optional; max 1) |

Each gap: dismissible per course; dismissed gaps excluded from `(n)` count. Never surface as monument content or L0 whisper.

---

## Library cabinet (Course Resources + Memory Timeline)

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | Single exploration drawer for **course resources** (PDFs, slides, links), **course links** (catalog view of portals + lane links), and **recent study history** (Memory Timeline). Not the Workspace archive — a glanceable index. |
| **Naming note** | “Library” here means **course reference drawer** in the anteroom — not a content library dashboard and not the app-level Workspace Library. |
| **When it appears** | Collapsed trigger: `▸ Library` — **no count when collapsed** (avoid `(17)` noise). Expanded on tap only. Timeline section hidden until first study event exists. |
| **Visual importance** | **Low collapsed; medium expanded.** Max 8 Resources rows + 5 Timeline rows + ghost links. |
| **Expanded sections** | **Resources** (top): Exams · Slides · Links groups. **Recent study** (bottom): text list, relative dates, no charts. |
| **Interaction** | Row tap → open in Workspace or ↗ external link. `View all in workspace →` at Resources footer. `View full history in workspace →` at Timeline footer. |
| **Failure modes** | Grid/thumbnail view → Notion creep. Timeline charts → dashboard. Count badge on trigger → KPI noise. Duplicating periphery Links as full list above fold. |

### Library vs periphery split

| Content | Periphery (rail) | Library (expanded) |
|---------|------------------|---------------------|
| Next 3–4 deadlines | Yes | No (future dates stay periphery) |
| Moodle quick exit | Yes | Full link catalog |
| All PDFs / materials | No | Resources section |
| Past study sessions | No | Recent study section |

---

## Storage wall (L3 — tasks · capture · shelf)

| Attribute | Definition |
|-----------|------------|
| **Why it exists** | Operational work (Exercises lane, capture, resource shelf) remains available but must not define MC identity. |
| **When it appears** | **Below fold** on all MC arrivals. Hidden entirely until first material added (new course). |
| **Visual importance** | **Lowest.** ~72% opacity, smaller labels, separated by horizontal rule from storage band. |
| **Failure modes** | Tasks above fold → Model B fails architecture validation. Shelf adjacent to monument → Notion creep. Progress strip here is acceptable; above fold is not. |

---

# PART 4 — STATE SYSTEM

## Routing reminder

| State | Default landing |
|-------|-----------------|
| New Course | MC |
| Empty Course | MC |
| Cold Return | MC |
| Exam Week | MC (same layout; copy/tone only) |
| Warm Return | **Workspace** (+ delegate strip); MC tab mirrors ranker if opened |
| Active Study Session | Workspace (session overlay); MC tab shows “session lives in Workspace” if opened |

---

## 1. New Course

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “I’m setting up. What do I do first?” |
| **Orientation copy (L0)** | `Welcome · Let's build your study space` |
| **Monument label** | START |
| **Monument title** | Set up [Course Name] |
| **Monument context** | Three things make a course ready: an exam date, your materials, and Moodle. |
| **Monument meta** | Omit |
| **Primary CTA** | `Add exam PDF` or `Claim desk · Enter workspace` — opens Workspace with add affordance focused |
| **Secondary** | `Set up later →` (ghost) |
| **Desk zone mood** | Neutral accent; empty desk explicit (“Unfurnished desk” optional subline inside frame) |
| **Drawers** | **Setup expanded** (3 items: PDF, exam date, Moodle). Active hidden. Library collapsed (Resources only if items exist; Timeline hidden). |
| **Storage wall** | **Hidden** — no tasks, capture, or shelf |
| **Periphery** | Links show `+ Add Moodle` prompts if empty |

---

## 2. Empty Course

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “I’ve been away / never started. Nothing is in flight.” |
| **Orientation copy (L0)** | `Let's get this course ready` or `No active study session` |
| **Monument label** | START |
| **Monument title** | Add your first study material |
| **Monument context** | Drop an exam PDF or create a notebook to begin. |
| **Monument meta** | Omit |
| **Primary CTA** | `Add first material` |
| **Secondary** | None or `Open workspace →` |
| **Drawers** | Setup expanded if gaps exist (max 2 visible). Active hidden. Library collapsed. |
| **Storage wall** | Hidden until first material exists |
| **Anti-pattern** | Never: “Nothing active yet — open Free Space” |

---

## 3. Warm Return

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “I’m still in flow. Don’t slow me down.” |
| **Default landing** | **Workspace** with session restored when study record exists (<4h) |
| **Workspace delegate strip** | Thin ranker output below periphery: `L0 · Solow Model · Q7 · [Resume]` — same copy as MC monument, ≤8% viewport height |
| **If user opens MC tab** | Desk zone shows: L0 `Session active in Workspace` · monument mirrors ranker · CTA `Return to session` |
| **Drawers** | All collapsed on MC arrival |
| **Storage wall** | Visible below fold on MC if user navigates there |
| **Strip hidden when** | User already inside restored study session with no ambiguity |

---

## 4. Cold Return

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “Where was I? What should I do?” |
| **Orientation copy (L0)** | `Exam in 9 days · You studied last night` (exam + last-active) |
| **Monument label** | CONTINUE or RETURN TO |
| **Monument title** | Solow Model · Question 7 |
| **Monument context** | Final Exam 2023 · Page 4 · Work notebook · Block 12 |
| **Monument meta** | Last active [relative time] |
| **Primary CTA** | `Resume study session` (crosses threshold with restore) |
| **Secondary** | `Open workspace →` |
| **Drawers** | All collapsed |
| **Storage wall** | Below fold, recessed |
| **Canonical MC state** | Reference for wireframes |

---

## 5. Exam Week

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “Exam close. I need focus, not panic.” |
| **Orientation copy (L0)** | `Exam in 3 days · Pick up where you left off` — warmer tone, **not red** |
| **Monument** | **Same structure as cold return.** Study session wins over lane task unless no session exists. |
| **Primary CTA** | Unchanged: `Resume study session` when ranker says session |
| **Ranker fallback** | No session: monument shows top lane task; CTA `Start focus session` or `Open task` — still one primary action |
| **Drawers** | Collapsed; Library Timeline may surface exam-prep events when expanded — never auto-expanded |
| **Periphery** | Exam date line slightly emphasized — no banner, no progress % above fold |
| **Forbidden** | Panic banner, amber alert strip, competing Do-next |

---

## 6. Active Study Session

| Dimension | Specification |
|-----------|---------------|
| **User mindset** | “I’m working. MC is not my surface.” |
| **Default landing** | Workspace with StudySessionShell overlay |
| **MC tab if opened** | L0 `Study session in progress` · monument: current exam + question/page · CTA `Return to session` |
| **Delegate strip** | Omit if overlay visible |
| **Drawers** | Collapsed |
| **Note** | MC does not host session UI — only points back |

---

# PART 5 — WIREFRAME DIRECTOR'S GUIDE

## Canvas and grid

| Surface | Width | Notes |
|---------|-------|-------|
| Desktop main column | max 720px centered | Desk zone full width of column |
| Desktop left rail | 248px | Links + Dates only |
| Mobile | 390px reference | Single column; no rail |
| Above-fold target | ~700px desktop viewport height | Desk zone ≥45% of above-fold |

## Zone proportions (desktop, cold return)

| Zone | Height share (above fold) | Width |
|------|---------------------------|-------|
| Periphery header | 8–10% | Full / rail |
| Desk zone | 45–50% | Main column |
| Storage band triggers | 8–10% | Main column |
| L3 storage wall | Below fold | Full width, recessed |

## Visual dominance map (cold return, MC)

| Element | Weight |
|---------|--------|
| Monument title | 28% |
| Desk zone frame (whitespace + enclosure) | 22% |
| Primary CTA | 12% |
| L0 whisper | 8% |
| Monument context + meta | 10% |
| Periphery | 10% |
| Cabinet triggers | 5% |
| Nav/tabs | 5% |

## Typography scale (locked)

| Token | Desktop | Mobile |
|-------|---------|--------|
| Course title | 17px / 650 | 17px / 650 |
| L0 whisper | 13px / 450 | 12px / 450 |
| Monument label | 10px / 750 caps | 10px / 750 caps |
| Monument title | 24px / 600 | 20px / 600 |
| Monument context | 13px / 450 | 13px / 450 |
| Monument meta | 11px / 450 | 11px / 450 |
| Primary CTA | 12px / 700 | 12px / 700 |
| Cabinet trigger | 12px / 500 | 12px / 500 |
| L3 labels | 9px / 750 caps | 9px / 750 caps |

## Color (structural only — no atmosphere)

| Token | Value | Use |
|-------|-------|-----|
| Background shell | `#070b14` | Rail, page base |
| Main lift | `rgba(255,255,255,0.012)` | Main column |
| Desk zone fill | `rgba(255,255,255,0.022)` | Monument enclosure |
| Text primary | `#e2e8f0` | Titles |
| Text muted | `#64748b` | L0, context |
| Text ghost | `#374151` | Meta, triggers |
| Accent | Course accent | Label, CTA fill, 2px left edge on desk frame |
| L3 recess | 72% opacity | Storage wall |

## Desk zone frame (Concept B)

- Rectangular enclosure, generous padding (32px desktop / 24px mobile)
- **2px left accent bar** at 55% opacity — only structural “decoration”
- No shadow, no gradient, no orb (wireframe phase)
- Monument centered or left-aligned within frame — **left-aligned recommended** for long titles

## Component checklist per wireframe

Every MC wireframe must include:

- [ ] Shell tabs with MC selected (except warm-return Workspace wireframes)
- [ ] Three zones labeled
- [ ] L0 + monument + single primary CTA in desk zone
- [ ] Three cabinet triggers: Setup · Active · Library (collapsed unless state says Setup expanded)
- [ ] L3 below fold marker
- [ ] Dominance map annotation
- [ ] Primary + secondary actions listed
- [ ] Warm-return Workspace wireframe: delegate strip with ranker parity note

## Wireframe deliverable set

| # | Frame | Desktop | Mobile |
|---|-------|---------|--------|
| 1 | Cold return (canonical) | Required | Required |
| 2 | New course | Required | Required |
| 3 | Empty course | Required | Required |
| 4 | Exam week | Required | Required |
| 5 | Warm return (Workspace + strip) | Required | Required |
| 6 | Warm return (MC tab if opened) | Optional | Optional |
| 7 | Active session (Workspace) | Optional | Optional |
| 8 | Active cabinet expanded | Optional | Optional |
| 9 | Setup cabinet expanded (new course) | Optional | Optional |
| 10 | Library cabinet expanded (Resources + Recent study) | Optional | Optional |

## Copy bank (use verbatim in wireframes)

| Key | Copy |
|-----|------|
| cold_l0 | Exam in 9 days · You studied last night |
| monument_label_continue | CONTINUE |
| monument_title | Solow Model · Question 7 |
| monument_context | Final Exam 2023 · Page 4 · Work notebook · Block 12 |
| monument_meta | Last active yesterday at 11:42pm |
| cta_primary | Resume study session |
| cta_secondary | Open workspace → |
| warm_strip | 18m ago · Solow Model · Q7 · Resume |
| exam_l0 | Exam in 3 days · Pick up where you left off |
| new_l0 | Welcome · Let's build your study space |
| library_resources_heading | Resources |
| library_timeline_heading | Recent study |
| library_view_all | View all in workspace → |
| library_view_history | View full history in workspace → |

## Explicit wireframe prohibitions

Do not draw above fold on MC:

- Progress percentage or bar
- Panic / alert banner
- Do-next strip
- Task checkboxes
- Resource shelf grids
- Equal-weight button pairs
- Workspace preview panel
- KPI tiles or stat rows
- Mess Detector score or severity UI
- Library count badge when collapsed (e.g. `Library (17)`)
- Coverage percentages or topic progress
- Timeline charts or graphs

---

# PART 7 — V1.1 INTEGRATION RULES (Model 2)

| Rule | Value |
|------|-------|
| Storage band | Exactly 3 triggers: **Setup · Active · Library** |
| Expanded cabinets | **One at a time** — opening one collapses others |
| Mess Detector | Backend only → Setup rows; max 2 visible |
| Course Setup | Setup cabinet + New/Empty monument states |
| Course Resources | Library → Resources section |
| Memory Timeline | Library → Recent study section; max 5 rows |
| Active vs Library | Active = continuation-adjacent; Library = full catalog + history |
| Study Mode | Workspace only — launch via desk CTA |
| Coverage | Postponed — not in V1.1 |

## Explicit non-goals (V1.1)

- Coverage KPIs or topic progress anywhere in MC
- Standalone Mess Detector panel or score
- Fourth storage-band trigger
- Library grid/thumbnail browser above fold
- Timeline as hero or chart
- Auto-expand Library on cold return
- Duplicate ranker output inside Library Resources top row

---

# PART 6 — SELF-CRITIQUE AND REVISION

## Initial weaknesses identified

1. **Storage band vs forbidden shelf** — “Materials / Setup / Schedule” triggers may read as dashboard widgets if bordered heavily.
2. **Zone borders** — Concept B requires frames; spec allows 2px accent only — designers may add chrome.
3. **Warm-return parity** — Delegate strip vs MC monument copy drift if not locked to same ranker strings.
4. **Exam week fallback** — Lane task as monument when no session is architecturally allowed but may feel task-manager.
5. **Left rail on desktop** — Split attention between rail and desk; mobile loses rail — two layouts to maintain.
6. **500-session Materials count** — Cap at 5 expanded creates “where did everything go?” unless Workspace is understood as archive.
7. **New vs empty course** — Similar wireframes; distinction relies on copy nuance.
8. **Active session MC tab** — Edge case may over-invest design for rare navigation.

## Ambiguities

- Exact warm bypass threshold copy when no study record but <4h away
- Whether `Schedule` cabinet duplicates Dates periphery
- Secondary CTA presence on cold return — spec allows one ghost link; wireframes may omit if cluttered

## Future dashboard creep vectors

| Vector | Entry point |
|--------|-------------|
| Progress % “just in periphery” | Rejected — stays in L3 or Setup only |
| Exam banner “just this week” | Rejected — L0 tone only |
| Auto-expand Materials on cold return | Rejected |
| Preview thumbnail in desk zone | Rejected (Concept C) |
| Second CTA for Focus session | Rejected — one primary |
| Setup gaps >2 | Rejected |

## Revisions applied (v1.1)

| Issue | Revision |
|-------|----------|
| V1.1 integration | Model 2: Setup · Active · Library cabinets |
| Mess Detector | Rules appendix under Setup; no standalone UI |
| Memory Timeline | Library → Recent study section |
| Course Resources | Library → Resources section |
| Library naming | Kept; gloss added — reference drawer, not content library |
| Materials renamed | Active cabinet (continuation-only) |
| Schedule removed | Future dates in periphery; past sessions in Library |

## Revisions applied (v1.0)

| Issue | Revision |
|-------|----------|
| Storage band creep | Renamed triggers to cabinet grammar; **no borders on triggers** — text + chevron only; expanded content inset 8px, max 5 rows |
| Zone chrome | Desk zone: **only** 2px left accent + fill delta; no full box border on wireframes |
| Schedule vs Dates | **Dates periphery** = next 3–4 urgent items. **Schedule cabinet** = full list when expanded. No duplication in wireframe above fold |
| Warm parity | Added **Copy bank** + requirement: strip text must match monument title + CTA verb |
| Exam fallback | Monument label becomes `CONTINUE`; context line names lane — never progress % |
| Materials cap | Expanded groups labeled; overflow `View all in workspace →` single ghost link |
| New vs empty | New course **always** hides L3; empty may show L3 below fold if course had prior activity |
| Active session MC | Specify as optional wireframe #7 — do not block core set |

---

# FINAL SPECIFICATION SUMMARY

Mission Control is a **three-zone anteroom** (periphery · desk · storage) that uses **Concept B spatial framing** and **Concept A typographic hierarchy**. The **desk zone monument** is the single continuation surface: read monument, then one primary CTA. V1.1 adds **three cabinets** — Setup (Course Setup + Mess Detector), Active (continuation materials), Library (Course Resources + Memory Timeline) — all collapsed on cold arrival except New Course Setup.

**Wireframes may proceed** using Part 5 deliverable set and copy bank.

---

*End of specification v1.1*

---

# V1.2 ADDENDUM — Orientation Layer (wireframes only)

**Status:** Locked for wireframe validation  
**Scope:** Mission Control wireframes only. No architecture, routing, or cabinet changes.

## What changed

| Addition | Role |
|----------|------|
| **Orientation Block** | Three labeled lines above desk zone: `This course:` · `You:` · `Here:` — plain-language course legibility |
| **Nearby Strip** | Max 3 text links below desk zone, above storage band — continuation-adjacent materials preview |

## What did not change

- Three-zone layout (periphery · desk · storage)
- Setup · Active · Library cabinets (triggers, expand rules, Mess Detector, Library sections)
- Routing (cold/first → MC; warm → Workspace)
- Monument + single primary CTA discipline
- Warm return delegate strip
- L3 below fold

## Orientation Block

**Placement:** Between L0 whisper and desk zone frame — **outside** desk enclosure.

**Structure:** Exactly 3 lines with visible prefixes:

| Prefix | Answers |
|--------|---------|
| `This course:` | Course inventory (material names, links — not counts) |
| `You:` | Recent activity / session state |
| `Here:` | Why MC exists / what to do (one sentence) |

**Typography:** 13px / weight 450 / `#64748b`; prefix weight 550. Same muted family as L0 — not a new heading level.

**L0 role unchanged:** Temporal/deadline whisper only (exam timing, last studied). Orientation Block does not duplicate countdown in line 1.

**Forbidden:** progress %, task lists, cabinet names, `(n)` badges, charts, more than 3 lines.

## Nearby Strip

**Placement:** Below desk zone (after CTA), above storage band triggers.

**Rules:**

- Max 3 text-only links
- Data: subset of Active cabinet cluster (On your desk + Nearby groups)
- Tap → open in Workspace
- Hidden when `n = 0` (new course before materials)
- **Not** a second continuation or filled CTA

**Forbidden:** thumbnails, grids, checkboxes, “Needs review” urgency styling, second Resume button.

## Revised dominance map (cold return)

| Element | Weight |
|---------|--------|
| Monument title | ~26% |
| Desk zone frame | ~20% |
| Primary CTA | ~12% |
| Orientation Block | ~10% |
| Monument context + meta | ~8% |
| Nearby Strip | ~6% |
| L0 whisper | ~6% |
| Periphery | ~8% |
| Cabinet triggers | ~5% |
| Nav/tabs | ~5% |

## Copy bank (V1.2 fixtures)

| State | This course | You | Here |
|-------|-------------|-----|------|
| Cold / Exam | Final Exam 2023 · Slides · Problem sets · Moodle | Question 7 last night · 2 notebooks in progress | Pick up exactly where you stopped |
| New | Not set up yet | First visit | Add an exam PDF and connect Moodle to begin |
| Empty | 2 PDFs · no exam date yet | No active session | Add material or open something you've uploaded |

## Product boundary (non-goals)

V1.2 orientation layer must **not**:

- Change Workspace, Studio, or Free Space identity
- Introduce app-wide dashboard or home-screen paradigm
- Read as LMS (syllabus, modules, completion, grades)
- Replace Active or Library cabinets
- Add routing or ranker logic changes

**Wireframes:** [`docs/wireframes/mission-control-v1.2.html`](wireframes/mission-control-v1.2.html) · ASCII: [`mission-control-wireframes-v1.2.md`](mission-control-wireframes-v1.2.md)

*End of specification v1.2 addendum*
