# ShopPilot UI Audit

**Generated:** 2026-04-28
**Scope:** Visual consistency, density, and "enterprise polish." Workflow/UX/behavior changes excluded.
**Source:** Codebase audit by general-purpose agent against design system docs and rendered patterns.

> **Authoritative design rules live in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).** This file is a running consistency-drift list. As findings get fixed, mark them ✅ inline. As new drift is spotted, append to this file.

## Status (2026-04-29)

**Closed:** UI-1, UI-2 (mostly), UI-3, UI-4, UI-5, UI-6, UI-7 (mostly), UI-9, UI-12, UI-14, UI-17, UI-22, UI-30 — plus the line-items indigo header pattern (separate finding, see UI-31 below).

**Still open:** UI-8, UI-10, UI-11/UI-28, UI-13, UI-15, UI-16, UI-18, UI-19, UI-20, UI-21, UI-23, UI-24, UI-25, UI-26, UI-27, UI-29.

**Updated resolutions:** UI-25 (we doubled down on raw divs as cards — Card primitive should be removed, not adopted). UI-15 (partially addressed — search bars use `bg-stone-50`, but the `Input` primitive default is still `bg-stone-100`).

---

## Top 3 highest-leverage (do first)

1. ~~**UI-1** — One canonical status-badge component~~ ✅ (badge.tsx + design system locks the spec)
2. ~~**UI-3** — One page-padding shell~~ ✅ (`PageShell` primitive)
3. ~~**UI-4** — Loading skeletons that match the current page layouts~~ ✅ (dashboard skeleton rewritten)

---

# High Impact

## UI-1 — Status badges/pills use 3+ competing styles ✅ RESOLVED

**Files:** `jobs-board-view.tsx:74`, `customers/[id]/page.tsx:488`, `inbox-list.tsx:36/156/161/247/273`, `dvi-section.tsx:60/106/133/174`, `team-list.tsx:72`, `customer-list.tsx:26`, `customer-type-editor.tsx:81`, `customers/[id]/page.tsx:213`

CLAUDE.md design system says all status badges should be `text-[10px] font-black px-2 py-1 rounded-full uppercase`. Reality: at least 4 different competing patterns coexist (`px-1.5 py-0.5 rounded text-[11px] font-medium`, `text-[10px] font-black px-2 py-1 rounded-md uppercase`, `h-[22px] px-2 rounded-full text-[11px]`, etc.).

**Fix:** Extend `components/ui/badge.tsx` with semantic variants (`status`, `count`, `tag`) and replace inline patterns. Most visible inconsistency in the app.

## UI-2 — `rounded-full` doc claim vs `rounded-md` reality ✅ MOSTLY RESOLVED

**Files:** `components/ui/button.tsx:8`, `input.tsx:11`, `select.tsx:40`, `badge.tsx:8`

CLAUDE.md claims "all buttons/inputs/selects rounded-full pill-shaped globally" — they aren't. Either docs are stale (likely after the "less bubbly" refactor) or codebase drifted. Decide direction and align both.

**Fix:** If sticking with `rounded-md` (Linear/Vercel feel), update CLAUDE.md and remove leftover `rounded-full` references on detail pages.

## UI-3 — Page padding inconsistent across top-level pages ✅ RESOLVED

**Files:** ~10 pages with 6 different patterns

- Detail pages: `max-w-6xl mx-auto px-4 lg:px-6 pb-12`
- List pages: `p-4 lg:p-6` (no max-w, no pb)
- Parking: `p-4 lg:p-10` (different desktop padding)
- Settings: `max-w-2xl mx-auto px-4 lg:px-6`

**Fix:** Pick one shell — recommend `max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6` for most pages, narrower max-w only for forms. Lift into a layout component.

## UI-4 — Loading skeletons stale, don't match current layouts ✅ RESOLVED (dashboard)

**Files:** `dashboard/loading.tsx:5`, `jobs/loading.tsx:5`, `reports/loading.tsx:10`

Dashboard skeleton renders sections that no longer exist. Jobs skeleton uses different padding (`p-4 lg:p-10`) than the real page (`p-4 lg:p-6`). Reports skeleton uses different card primitive than the real report.

**Fix:** Re-author each `loading.tsx` against the current page structure. Linear/Vercel-grade polish requires the skeleton to visually match what's about to render — eliminates the layout-jump that signals "amateur."

## UI-5 — Two different KpiCard components, different visual treatment ✅ RESOLVED

**Files:** `dashboard/page.tsx:223` (local), `components/dashboard/kpi-card.tsx:21` (shared)

Local dashboard `KpiCard` has no border-l accent and uses `text-[22px] font-semibold`. Shared component has `border-l-4` colored accent and `text-2xl font-bold`. Reports use the shared one; dashboard uses its private clone. Same data role rendered two ways.

**Fix:** Pick one. Recommend extending the shared `KpiCard` to handle both layouts via a prop, then delete the local one.

## UI-6 — Color palette: green vs emerald, slate vs stone ✅ RESOLVED

**Files:** `constants.ts:34/64` (green), `constants.ts:323` (emerald), `kpi-card.tsx:62` (emerald), `customers/[id]/page.tsx:80` (emerald via accent)

`JOB_STATUS_COLORS.complete` and `PAYMENT_STATUS_COLORS.paid` use `green-*`; `DVI_STATUS_COLORS.approved` uses `emerald-*`. Slate (cool) mixes with stone (warm) on dashboard. Mixing reads as a bug to discerning eyes.

**Fix:** Pick one positive (emerald) and one neutral (stone). Replace globally. "Big company" design systems don't have two greens.

## UI-7 — `shadow-card` and `shadow-sm` used interchangeably ✅ MOSTLY RESOLVED

**Files:** dashboard cards use `shadow-sm`; `JobCard` uses `shadow-card`; `Card` primitive uses `shadow-card`

`shadow-card` is the design-token shadow with tinted opacity. `shadow-sm` is Tailwind default (gray). Functionally similar, visually different. Cards on adjacent panels with different shadows = un-tuned.

**Fix:** Adopt `shadow-card` everywhere; deprecate inline `shadow-sm` for cards.

## UI-8 — Sidebar nav active state too loud in light mode

**File:** `sidebar.tsx:113`

`bg-blue-600 dark:bg-stone-700 text-white font-semibold`. After the recent dark-mode → stone refactor, light-mode blue is now the only saturated chrome on the page edge — it shouts. Dark mode is restrained; light mode isn't.

**Fix:** Calm the light-mode active state to a stone tone (`bg-stone-100 text-stone-900` or similar) so both modes read as restrained. OR commit to brand-blue and update dark mode back to blue.

## UI-9 — Dashboard Shop Floor columns each have different colored header strips ✅ RESOLVED

**File:** `dashboard/page.tsx:336-368`

Three columns side-by-side, each with own bg/border/text color (slate/amber/blue). Compare to the kanban board (`jobs-board-view.tsx:73-76`) which uses neutral header + small status pill — much more restrained. Same content, two opposite treatments.

**Fix:** Adopt the kanban pattern (neutral header + tiny status pill) on the dashboard for consistency. Colored panel headers are a strong "consumer SaaS" tell.

## UI-10 — Notes "yellow notepad" treatment is half-committed

**Files:** `jobs/[id]/page.tsx:245`, `customers/[id]/page.tsx:290`, `parking/[id]/page.tsx:284`

The yellow strip with amber square + uppercase "Notes" label sticks out as the only place yellow is used as a panel surface. Falls between two stools — not committed enough to feel like a Post-it (no rotation, drop shadow, handwriting font), too committed to feel like a normal section.

**Fix:** Either lean in (slight rotation, drop shadow, Caveat font) or restyle as a neutral section with a small "Notes" header. Pick one direction.

---

# Medium Impact

## UI-11 — `01/02/03` SectionTitle prefix fights the rest of the UI

**File:** `components/ui/section-title.tsx:20`

Numbered prefixes on every section after the recent `text-lg` heading bump make sections look like textbook chapters. Linear/Notion don't number sections.

**Fix:** Drop the number entirely, OR keep it only on the print Repair Order where chapter numbering reads correctly.

## UI-12 — `SectionCard` header uses `bg-sidebar` (very dark) — too heavy ✅ RESOLVED

**File:** `components/ui/section-card.tsx:41` (used by report tables, customer-list desktop header, many tables)

A dark navy/stone-800 strip with bold white uppercase label is heavier than the page surrounding it. The eye lands there first, even when the data is the actual content.

**Fix:** Replace with `bg-stone-50 dark:bg-stone-900` + `text-stone-600` label — same legibility, far less visual weight.

## UI-13 — Job detail header has too many micro-rows; identity gets buried

**File:** `jobs/[id]/page.tsx:100-243`

Section card stacks: tiny mono RO# strip → title → status pill → 3-column avatar+dl grids → notepad strip. Each row uses different label widths (`grid-cols-[70px_1fr]`, `grid-cols-[100px_1fr]` on customer page).

**Fix:** Standardize the dt width to one value (recommend `100px` on detail pages, `70px` only on inline editors).

## UI-14 — Avatar/icon "tile" treatment duplicated and slightly off ✅ RESOLVED (customer = violet established)

**Files:** `customer-list.tsx:65`, `customers/[id]/page.tsx:193`, `jobs/[id]/page.tsx:134/193`, `team-list.tsx:59`, `dashboard/page.tsx` ActionRow, `parking/[id]/page.tsx`, `settings/page.tsx:60`

Different sizes (h-7 / h-8 / h-9 / h-10 / h-14 / w-14), inconsistent color assignments (customer = blue OR violet?). 

**Fix:** Make a `<Tile size icon tone />` primitive. Standardize: detail page = 14, list page = 8, action row = 9; customer = violet always, vehicle = stone, system/settings = blue.

## UI-15 — Inputs use `bg-stone-100`, invisible against page bg ⚠️ PARTIAL (search bars use `bg-stone-50`; `Input` primitive default still `bg-stone-100` — TODO)

**File:** `components/ui/input.tsx:11`

Page background is `oklch(0.955 0.002 260)` — nearly identical to `stone-100`. Inputs only visible because of border. On filter toolbars sitting on the page background (e.g. `jobs-toolbar.tsx:71`), inputs disappear unless explicitly given `bg-card`.

**Fix:** Default the input to `bg-card` and let cards override, OR keep `bg-stone-100` and document that filter toolbars must wrap inputs in a card surface.

## UI-16 — Buttons use mixed sizes/weight for the same primary action

**Files:** `dashboard/page.tsx:529/532/538`, `customers/[id]/page.tsx:181/416`, `customers/page.tsx:38`, `jobs-toolbar.tsx:145`

"New Job" button has different `gap-1.5` overrides, different icon sizes (`h-3.5 w-3.5` vs base `[&_svg]:size-4`).

**Fix:** Settle on `gap-1.5` in the button base or remove all per-call overrides. Same for icon size.

## UI-17 — Quick Pay button on dashboard breaks the design system ✅ RESOLVED

**File:** `dashboard/page.tsx:535`

`<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">` — the only place a non-primary, non-destructive CTA gets a custom green. Inline color overrides are exactly what enterprise design systems prevent.

**Fix:** Promote this to a `Button variant="success"` if there's a real "money" semantic, OR use the standard primary blue.

## UI-18 — Hard-coded hex/oklch literals bypass tokens

**Files:** `globals.css:81/85/87/142`, `reports-overview-chart.tsx:16`, `customer-insights.tsx:27-28`

Hex literals in light-mode tokens (while everything else is oklch). Chart colors as oklch literals in components (don't track theme).

**Fix:** Define `--chart-primary`, `--chart-positive`, `--chart-negative` tokens in `globals.css`. Have charts read from them. Replace hex with oklch in tokens for consistency.

## UI-19 — Mobile bottom-nav active state is the loudest thing on mobile

**File:** `bottom-nav.tsx:46`

Active item uses `text-blue-600 font-semibold` plus extra `bg-blue-600` indicator bar at top. Combined with sidebar's blue active pill (light mode), mobile users see two saturated blues simultaneously.

**Fix:** Switch to a thin neutral underline + filled icon (lucide `icon-filled` utility already exists at `globals.css:180`).

## UI-20 — Empty states present but copy is generic

**Files:** `jobs-board-view.tsx:84` ("Empty"), `team-list.tsx:51` ("No team members yet"), `dashboard/page.tsx:402` ("None"), many others

Linear/Vercel pattern: 1 icon + 1 short heading + 1 sentence helper + 1 primary CTA. Most empty states here have only the heading.

**Fix:** Standardize via small `<EmptyState icon title hint cta />` component. Replace generic placeholders.

## UI-21 — Color palettes for vehicle dots, customer accents, charts overlap inconsistently

**Files:** `customers/[id]/page.tsx:37-44` (6-color palette), customer-insights chart (different palette), `horizontal-bar-chart.tsx:5-13` (8-color palette)

Same colors used across vehicle dots, parking shuttle badge, charts — inconsistently. Blue means three different things across three views.

**Fix:** Define one ordered chart palette (`--chart-1` through `--chart-8`) in `globals.css`. Reuse across dots, charts, kanban accents.

## UI-22 — Tap targets and hover surfaces vary by row ✅ RESOLVED (standard hover bg now `stone-50/stone-800-50`)

**Files:** `customer-list.tsx:60-83`, `customers/[id]/page.tsx:458`, dashboard ShopFloor rows, action center rows

Hover surface alternates between `stone-50` and `stone-100/40`. Row paddings inconsistent (`py-2` / `py-2.5` / `py-3`).

**Fix:** Standardize: dense list `py-2`, default list `py-2.5`, comfortable `py-3`. Always `hover:bg-stone-50` (or `dark:bg-stone-800/40`).

## UI-23 — Negative-margin hack `-ml-3` on back buttons

**Files:** Most detail pages — `<Button variant="ghost" size="sm" className="-ml-3">`

Negative margin is a layout escape valve, repeated 10+ times.

**Fix:** Wrap back-buttons in a `<DetailHeader>` primitive that handles its own offset, OR adjust page padding to remove the need.

## UI-24 — `font-mono tabular-nums` used inconsistently for numbers

**Files:** various

KPI values, days badges, phone numbers all use `font-mono tabular-nums`. Job total in `JobCard` uses just `tabular-nums` (no `font-mono`). Currency in tables sometimes mono, sometimes plain.

**Fix:** Establish: all currency/quantity = `font-mono tabular-nums`, no exceptions. Add `font-mono` to JobCard's total.

---

# Low Impact / Nits

## UI-25 — `Card` primitive nearly unused; raw divs proliferate ⚠️ RESOLUTION REVERSED — DELETE THE PRIMITIVE

**Files:** `components/ui/card.tsx` exists but most pages use raw `<div className="bg-card border border-stone-200 ... rounded-lg shadow-sm overflow-hidden">`. Card primitive uses `py-5` (no border) — irreconcilable today.

**Fix:** Either delete the primitive or refactor existing pages to use it.

## UI-26 — `Table` primitive cell padding too generous for actual usage

**File:** `components/ui/table.tsx:86` — `px-6 py-5` defaults. Real tables use `px-3 py-2` or `px-4 py-2`.

**Fix:** Update primitive defaults to dense values so future tables follow established density.

## UI-27 — `text-[10px]` and `text-[11px]` interchangeable for the same role

Section labels: `SECTION_LABEL` is `[11px]`, sidebar group labels `[10px]`, dashboard ShopFloor column label `[11px]`, some pills `[10px]`.

**Fix:** Pick one for the "label" role. Recommend `[11px]`.

## UI-28 — SectionTitle's mono `01` competes visually with the section label nearby

**File:** `components/ui/section-title.tsx:20`

Both at `text-[11px]`. Number serves no functional purpose.

**Fix:** Drop or differentiate (smaller, dimmer, or larger).

## UI-29 — Mobile-only Broadway Motors mark uses different brand treatment than sidebar

**File:** `header.tsx:77-82`

Mobile mark uses `bg-primary` with `Wrench`. Sidebar uses `text-blue-500 dark:text-stone-300` (no bg). Two different brand treatments.

**Fix:** Pick one mark and reuse.

## UI-30 — Skeleton primitive `bg-accent` nearly invisible on light page ✅ RESOLVED (dashboard skeleton; bg-stone-200/70)

**File:** `components/ui/skeleton.tsx:7`

`bg-accent animate-pulse` against page bg of `oklch(0.955 ...)` — skeletons barely show.

**Fix:** Use `bg-stone-200/70` so loading states animate visibly.

---

## Summary

- **High impact:** 10 findings (UI-1 to UI-10)
- **Medium impact:** 14 findings (UI-11 to UI-24)
- **Low impact / nits:** 6 findings (UI-25 to UI-30)

**Files most worth a holistic pass:**
- ~~`src/components/ui/badge.tsx`~~ ✅
- `src/components/ui/section-card.tsx` — lighten the dark header (UI-12 lightened bg-sidebar in usage; primitive itself may still need work)
- `src/components/layout/sidebar.tsx` — calm the light-mode active state (UI-8, in earlier-session uncommitted work)
- ~~`src/app/(dashboard)/dashboard/loading.tsx`~~ ✅ — `jobs/loading.tsx` may still be stale
- ~~`src/lib/constants.ts`~~ ✅ — emerald migration finished, JOB_STATUS_BAR added
- `src/app/globals.css` — chart color tokens, replace hex with oklch (UI-18)
- ~~`CLAUDE.md`~~ ✅ — design rules now live in `DESIGN_SYSTEM.md`, CLAUDE.md slimmed

---

# Findings added during 2026-04-29 session

## UI-31 — Indigo category headers on line items section ✅ RESOLVED

**Files:** `src/components/dashboard/line-items-list.tsx`

Original line items rendered category headers (Suspension / Brake / etc.) with `bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700`. Indigo wasn't in the design system anywhere else; reads off-palette.

**Fix shipped (commit f8aa0d7):** Replaced with neutral `bg-stone-50 dark:bg-stone-900/60 text-stone-600` strip. Categories now render as sections within one outer card, with `border-t-2 border-stone-200` between categories for stronger inter-section separation. Totals moved into the same card on a tinted footer strip.
