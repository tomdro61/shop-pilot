# ShopPilot — Design System

**This is the authoritative design system reference.** When a rule here disagrees with another doc, this file wins. Updated after every visual change.

The design language is internally called **Stitch**. North stars: **Linear, Stripe, Vercel** — restrained density with intentional, structural use of color. Not pure grayscale, not consumer-SaaS bubbliness.

---

## Table of Contents
1. [Principles](#1-principles)
2. [Color Tokens](#2-color-tokens)
3. [Typography](#3-typography)
4. [Border Radius](#4-border-radius)
5. [Shadows](#5-shadows)
6. [Borders & Dividers](#6-borders--dividers)
7. [Hover States](#7-hover-states)
8. [Status Badges](#8-status-badges)
9. [Dark Mode](#9-dark-mode)
10. [Layout Primitives](#10-layout-primitives)
11. [Component Primitives](#11-component-primitives)
12. [Layout Patterns](#12-layout-patterns)
13. [Identity Colors](#13-identity-colors)
14. [Status Color Maps](#14-status-color-maps)
15. [Accent System](#15-accent-system)
16. [Accessibility](#16-accessibility)
17. [Anti-patterns](#17-anti-patterns-things-this-system-rejects)

---

## 1. Principles

**Color is a scanning aid and identity signal, not chrome.** The page should feel alive, not sterile. But avoid panel chrome (full saturated colored slabs).

- ✅ Small colored icon tiles in card corners
- ✅ Colored left-border / top-border accent strips (3–4px)
- ✅ Status pills, priority dots, category badges, KPI delta chips
- ✅ Section icons that carry color identity next to a neutral header
- ✅ Soft tinted backgrounds (5–15% opacity, e.g. `bg-stone-50` / `bg-emerald-50`)
- ❌ Fully saturated colored panel chrome
- ❌ Bold white uppercase text on saturated colored bars (consumer SaaS tell)
- ❌ Three columns side-by-side each with a different big colored background
- ❌ Pure grayscale (sterile)

**Density without clutter.** Linear/Stripe-grade density. One canonical primitive per UI role (badge, KPI card, page shell, section header, etc.). New raw `<div>` styled as a card → reach for the existing primitive instead.

**Run-on text → structured chunks.** When data has multiple distinct pieces (count, dollar amount, age), don't run them together with bullets. Use the [structured metric chunks pattern](#121-structured-metric-chunks).

---

## 2. Color Tokens

### Light mode

- **Page bg:** `oklch(0.955 0.002 260)` — cool blue-gray
- **Card surface:** `bg-card` (white)
- **Primary action:** `blue-600` / `blue-700` hover
- **Border baseline:** `border-stone-200`

### Dark mode

Standard dark conventions. Treat as its own thing — do **not** carry the cool-blue-gray vibe from light mode, do **not** apply warm-stone tones.

- **Page bg:** `bg-stone-950`
- **Card surface:** `bg-stone-900` (or stone-925 in some places)
- **Primary action:** `blue-500` / `blue-400` hover
- **Border baseline:** `border-stone-800`

### Semantic colors

ONE family per role. No mixing within a role.

| Role | Color family | Hex anchor | Usage |
|---|---|---|---|
| Positive / paid / complete / money | `emerald` | `emerald-500/700/950` | Job complete badge, payment success, KPI delta up |
| Warning / pending / aging | `amber` | `amber-500/700/950` | Waiting for parts, aging loops, pending estimates |
| Destructive / overdue / urgency | `red` | `red-500/700/950` | Delete buttons, overdue badges, money owed |
| Primary / info / in-progress | `blue` | `blue-500/600/700/950` | CTAs, in-progress status, links |
| Customer identity | `violet` | `violet-500/700/950` | Customer avatar tiles, customer-related accents |
| Neutral | `stone` | `stone-50…stone-950` | Backgrounds, body text, borders, "not started" |
| Sub-section accent | `indigo` | `indigo-500/700/950` | Open Loops follow-up category, sparingly |

**Banned:** `green-*`, `slate-*`, `gray-*`. Use `emerald-*`, `stone-*` instead. **One green family** — never mix `green` and `emerald`.

---

## 3. Typography

- **Body / UI font:** Inter
- **Numbers (currency, RO, %, dates, durations):** `font-mono tabular-nums` — every time, no exceptions

### Type scale

| Role | Class | Notes |
|---|---|---|
| Page title | `text-base lg:text-lg font-semibold` | Greeting on dashboard, section title on detail pages |
| Section title (major) | `text-lg font-semibold tracking-tight` | Job detail Progress / Line items / Inspection |
| Section title (compact) | `text-sm font-semibold` | Dashboard sections (via SectionHeader) |
| KPI label | `text-[11px] font-semibold uppercase tracking-wider text-stone-500` | KpiCard label, sub-header card label |
| KPI value (primary) | `text-[28px] font-bold tracking-tight tabular-nums` | Dashboard KPI cards |
| KPI value (compact) | `text-lg font-bold tabular-nums` | Sub-header card metric chunks |
| Body | `text-sm` | Table rows, customer info |
| Secondary metadata | `text-xs text-stone-500` | Timestamps, RO numbers, captions |
| Status badge | `text-[10px] font-black uppercase tracking-wider` | All status pills |
| Filter chip | `text-xs font-medium` | Open Loops filter, list-page filters |
| Caption / table column header | `text-[11px] uppercase tracking-wider text-stone-500/600` | Table headers, "RO Number" labels |

**Numerical hierarchy:** large mono values use **tight tracking + heavy weight** for stock-ticker presence — that's the distinctive choice.

---

## 4. Border Radius

- **`rounded-md`** is **canonical** for buttons, inputs, selects, badges, cards, icon tiles, status pills (most UI primitives).
- **`rounded-full`** reserved for: status pills (the small `text-[10px]` ones), count badges, avatar/icon tiles where the pill shape is semantically meaningful.
- **`rounded-lg`** is **deprecated** — replace with `rounded-md` whenever encountered.
- **`rounded` (default 4px)** sometimes used for tiny chips — acceptable.

---

## 5. Shadows

- **`shadow-card`** is the canonical card shadow (custom token in `globals.css`, tinted opacity).
- **`shadow-sm`** is **deprecated** — replace with `shadow-card` whenever encountered.

---

## 6. Borders & Dividers

| Use | Class | Notes |
|---|---|---|
| Card outer border | `border border-stone-200 dark:border-stone-800` | Standard |
| Inter-row dividers (lists, tables) | `border-b border-stone-200 dark:border-stone-800` | Was stone-100 — too faint; standardized to stone-200 |
| Inter-section divider (within one container) | `border-t-2 border-stone-200 dark:border-stone-800` | Doubled thickness — used between line-item categories, above totals |
| Vertical metric divider (sub-header card chunks) | `w-px bg-stone-300 dark:bg-stone-700` | Slightly stronger than border-stone-200 to read against the lighter card surface |
| Heavy navy / sidebar bg | DEPRECATED | `bg-sidebar` for table headers — replaced by `bg-stone-50 dark:bg-stone-900/60` |

**Rule:** `border-stone-100` is reserved for the lightest internal whitespace dividers only. For any structural divider, use `stone-200`.

---

## 7. Hover States

**Standard hover bg for clickable rows:**
```
hover:bg-stone-50 dark:hover:bg-stone-800/50
```

Apply consistently across: list-view rows, dashboard Open Loop rows, Shop Floor job cards, customer-list rows, jobs-list-view rows. The previous `hover:bg-stone-100 dark:hover:bg-stone-800/40` is **deprecated**.

Transition: `transition-colors` — 150ms default. No bounces, no scales.

---

## 8. Status Badges

```css
text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider
```

with `bg-{tone}-100 text-{tone}-700 dark:bg-{tone}-950 dark:text-{tone}-300` (or 400 in some cases).

Applies to: job status, payment status, estimate/invoice status, loop category, DaysBadge in `format="label"` mode.

---

## 9. Dark Mode

**Each mode is its own thing.** Don't mirror light-mode tokens 1:1.

- Light mode: cool blue-gray bg + warm shadow + blue accents
- Dark mode: neutral dark grays + subtle borders + blue accents

**Don't:**
- Apply the cool-blue-gray vibe to dark mode
- Apply warm stone tones to dark mode (was a transitional state — should be cleaned up)
- Use `dark:bg-stone-800/40` when `/50` reads better — standardized to `/50` in hover states

---

## 10. Layout Primitives

### `PageShell` — `src/components/layout/page-shell.tsx`

The canonical page container. `max-w` + `px` + `py` + `space-y-4`. Width is a typed enum (`PageWidth`), not a free-form string.

```tsx
<PageShell>{...}</PageShell>             // default: max-w-[1400px] (dashboard, list pages)
<PageShell width="wide">                 // max-w-6xl — detail pages (job, customer, parking, estimate)
<PageShell width="narrow">               // max-w-4xl — DVI list/detail
<PageShell width="tight">                // max-w-2xl — settings nav, narrow forms
```

Width rule:
- **Dashboard, jobs list, customers list, reports, settings list** → `width="default"` (= `max-w-[1400px]`)
- **Detail pages** (single record) → `width="wide"` (= `max-w-6xl`, ~1152px)
- **DVI list + detail** → `width="narrow"` (= `max-w-4xl`)
- **Settings nav** → `width="tight"` (= `max-w-2xl`)

`p-4 lg:p-6` page wrapping is **deprecated** — pages should wrap in `PageShell`.

### `DashboardShell` — `src/components/dashboard/dashboard-shell.tsx`

Dashboard-specific shell that composes `PageShell` and adds:
- Slim header strip: greeting + visual search placeholder (non-functional v1) + Quick Actions

### `SectionHeader` — `src/components/dashboard/section-header.tsx`

Canonical section header for dashboard sections (Open Loops, Shop Floor) and other index/list groupings.

```tsx
<SectionHeader
  icon={Inbox}
  iconTone="blue"
  title="Open Loops"
  count={loops.length}
  accent={<OverdueBadge />}
  actionLabel="View all"
  actionHref="/inbox"
/>
```

Renders: small icon tile (`w-6 h-6 rounded-md`) + title + count chip + optional accent + right-aligned action.

### `SectionTitle` — `src/components/ui/section-title.tsx`

Used for **major content sections** on detail pages (Progress, Line items, Inspection, Estimate & invoice).

```tsx
<SectionTitle title="Line items" action={<AddBtn />} />
// num= prop is optional — DO NOT pass numbered prefixes (UI-11)
```

The `num="01"` chapter-style prefix is **deprecated** — drop it on every page.

---

## 11. Component Primitives

### `KpiCard` — `src/components/dashboard/kpi-card.tsx`

Discriminated visual variants:
- **Icon variant** (preferred) — `<KpiCard icon={Calendar} tone="green" ... />`
- **Border-left variant** (legacy, used on report pages) — `<KpiCard accentColor="blue" ... />`

Renders: small `w-8 h-8 rounded-md` icon tile + label + large mono value + delta chip (top-right) + subtitle.

### `KpiCompactCard` — `src/components/dashboard/kpi-compact-card.tsx`

3-cell today / week / month split. Used for inspection counts and jobs-closed on the dashboard. Today is the primary cell (bigger).

### `SubHeaderCard` — `src/components/dashboard/sub-header-card.tsx`

**Doors, not metrics.** Wider entry-point cards (Parking, Awaiting Payment on dashboard) — chevron + larger 40×40 icon tile + structured metric chunks + `href` (always a Link).

```tsx
<SubHeaderCard
  icon={ParkingCircle}
  tone="blue"
  title="Parking"
  tag="TODAY"
  metrics={[
    { value: 3, label: "Drop-offs" },
    { value: 0, label: "Pickups" },
  ]}
  emptyMessage="No activity today"
  href="/parking"
  muted={...}
/>
```

Each metric: big mono number + small uppercase label, separated by vertical dividers (`bg-stone-300 dark:bg-stone-700`). Optional `tone` per metric (`emerald | amber | red | neutral`) for value color.

### `OpenLoops` — `src/components/dashboard/open-loops.tsx`

Single source of truth for "needs you." Filter chips + scrollable list of `OpenLoopRow`s. Each row is a single line:

```
[CATEGORY pill+icon]  [MS avatar]  Customer · Vehicle  Summary text  [AGE]  Snooze  Dismiss  [Resolve]
```

- Category pill is colored text + icon, fixed 96px wide
- Customer initial avatar is `w-7 h-7 rounded-md bg-violet-50 …` (customer identity)
- Snooze/Dismiss are placeholder buttons (until `open_loops` table lands in Phase 0)
- Resolve is primary blue button

Categories live in `OPEN_LOOP_CATEGORIES` (see [§14](#14-status-color-maps)). Each category has icon + label + aging tier (warnAt/overdueAt) + chip class.

### `ShopFloorColumn` — `src/components/dashboard/shop-floor-column.tsx`

Dashboard kanban column. Has:
- 3px colored top accent strip per status (uses `JOB_STATUS_BAR`)
- Neutral header row with small icon tile + title + count chip + "View all" link
- Rows are clickable job cards with: RO# (top-left), days badge + dollar amount (right column stack), customer name + vehicle + title (left column)

The Complete column is **dropped** — paid/complete jobs surface in the Awaiting Payment card instead.

### `JobCard` — `src/components/dashboard/job-card.tsx`

Used by jobs-board-view (kanban). Richer than ShopFloorColumn's row card — has StatusSelect dropdown, vehicle row, tech avatar, optional DVI badge.

Per-card left accent strip uses `JOB_STATUS_BAR`. Card is `role="link" tabIndex={0} onClick + onKeyDown` for full keyboard nav.

### `DaysBadge` — `src/components/ui/days-badge.tsx`

Two formats:
- `format="short"` — compact `5d` (default; used in cramped contexts like Shop Floor cards)
- `format="label"` — narrative `5D AGING` / `2D OVERDUE` / `ON TIME` / `TODAY` (used in Open Loops)

Three escalation tiers driven by `warnAt` (default 3) and `overdueAt` (default 7):
- Fresh (< warnAt) — `bg-stone-100 text-stone-600`
- Aging (warnAt ≤ d < overdueAt) — `bg-amber-100 text-amber-900`
- Overdue (≥ overdueAt) — `bg-red-100 text-red-800`

Per-category overrides set warnAt/overdueAt on a per-loop basis (e.g. DVI = 1d/3d, parking lead = 2d/5d).

### `MiniStatusCard` — `src/components/ui/mini-status-card.tsx`

Compact horizontal status card with colored left accent. Used for Inspection / Estimate / Invoice rows on the job detail page. Source of the `Accent` palette (see [§15](#15-accent-system)).

### `ClickableRow` — `src/components/ui/clickable-row.tsx`

Use this whenever a row needs to be clickable. Renders `role="link"` div with proper keyboard nav. Required by CLAUDE.md anti-pattern rule on `<div onClick>`.

### `Card` primitive — `src/components/ui/card.tsx`

**DEPRECATED.** The codebase has converged on raw `<div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card">` — the Card primitive is unused. Either delete it or refactor it to match. Until then, do **not** reach for it; use the raw pattern.

---

## 12. Layout Patterns

### 12.1 Structured metric chunks

When showing 2+ distinct pieces of metric data, render as **vertically stacked big mono number + small uppercase label**, separated by **vertical dividers** (`w-px bg-stone-300 dark:bg-stone-700`).

```
3            0
DROP-OFFS  | PICKUPS
```

Used on: SubHeaderCard, job detail header (RO Number / Opened / Total), customer detail Financial Snapshot, parking detail trip summary (when applied).

**Anti-pattern:** running text "3 drop-offs · 0 pickups · oldest 12 days" — reads as caption instead of scannable chunks.

### 12.2 3px top accent strips

For multi-column status surfaces (Shop Floor on dashboard, jobs board kanban), each column gets a 3px colored top strip per status:

```tsx
<div aria-hidden className={`h-[3px] w-full ${JOB_STATUS_BAR[status]}`} />
```

Combined with the small colored icon tile in the column header — gives strong identity without panel chrome.

### 12.3 Line items: one container, internal sections

Job detail line items render as **one outer card** containing all categories. Within:
- Each category gets a `bg-stone-50 dark:bg-stone-900/60` header strip (neutral, NOT indigo) with category name + subtotal
- Categories after the first get `border-t-2 border-stone-200` for stronger inter-section separation
- Line items are rows with `border-b border-stone-200`, blue/amber 3px left strip for type
- Totals as a footer strip inside the same card with `border-t-2` + tinted bg

**Anti-pattern:** indigo category headers (`bg-indigo-50 text-indigo-700`) — off-palette.

### 12.4 "Doors not metrics"

Cards that link out (parking/awaiting-payment on dashboard) are visually distinct from KPI cards — they have a **chevron** on the right, larger 40×40 icon tile (vs 32×32 on KpiCard), and hover-on-border. Tells the user "click here" without reading.

### 12.5 Customer initial avatar

Customer identity is carried by a small violet tile with 2-letter initials:

```tsx
<span className="w-7 h-7 rounded-md grid place-items-center bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900 text-[10px] font-bold">
  {getInitials(customerName)}
</span>
```

Sizes: `w-7 h-7` (compact, in lists), `w-10 h-10` (job/estimate/customer detail header), `w-14 h-14` (customer detail hero).

Used on: customer-list (mobile + desktop), invoice list, estimate detail header, job detail customer column, customer detail hero, Open Loops rows.

**Settings page nav icons stay BLUE** — those are system/nav icons, not customer avatars.

### 12.6 Section header spine

Major dashboard sections (Open Loops, Shop Floor) follow this header pattern, OUTSIDE the card surface:

```
[icon-tile] Section Name [count]  [optional accent pill]    [View all →]
─                                                              (the card content sits below)
```

Detail-page major sections (Progress, Line items, etc.) use `SectionTitle` (text-lg).

---

## 13. Identity Colors

| Identity | Hue | Where |
|---|---|---|
| Customer | `violet` | Avatar tiles, Open Loops customer chip |
| Tech (people) | `blue` | Tech avatar (header.tsx, team-list, JobCard) |
| Vehicle | `stone` | Vehicle icon tiles |
| System / nav | `blue` | Settings page row icons, header user avatar |
| Money / payment | `emerald` (positive), `red` (overdue) | Awaiting Payment card, payment due loops |
| Parking | `blue` (sky) | Parking sub-header card, shuttle badge |
| Inspection | `violet` | DVI category in Open Loops |
| Follow-up | `indigo` | Follow-up category in Open Loops |

---

## 14. Status Color Maps

All status maps live in `src/lib/constants.ts` and use typed Records (`Record<JobStatus | "paid", T>`) so a missing status is a compile error.

### `JOB_STATUS_COLORS` (tinted pill background — `-100/-950`)
- not_started → red
- waiting_for_parts → amber
- in_progress → blue
- complete → emerald
- paid → emerald (legacy)

### `JOB_STATUS_BAR` (saturated 500-weight strip — for top accents + per-card left bars)
- not_started → bg-red-500
- waiting_for_parts → bg-amber-500
- in_progress → bg-blue-500
- complete → bg-emerald-500
- paid → bg-emerald-500

### `OPEN_LOOP_CATEGORIES` — `src/lib/dashboard/open-loops.ts`
| Category | Tone | Icon | warnAt | overdueAt |
|---|---|---|---|---|
| `payment_due` | emerald | DollarSign | 3d | 7d |
| `estimate` | blue | FileText | 3d | 7d |
| `dvi` | violet | ClipboardCheck | 1d | 3d |
| `follow_up` | indigo | Bell | 2d | 5d |
| `parts` | amber | Package | 3d | 7d |

### `PAYMENT_STATUS_COLORS`, `ESTIMATE_STATUS_COLORS`, `INVOICE_STATUS_COLORS`
Same `bg-{tone}-100 text-{tone}-700` pattern. All `paid`/`approved`/`sent` (positive) entries use `emerald`, never `green`.

---

## 15. Accent System

`src/components/ui/mini-status-card.tsx` exports the canonical `Accent` palette:

```ts
type Accent = "green" | "amber" | "blue" | "red" | "indigo" | "stone";
```

The `"green"` enum value is a **legacy alias** — `ACCENT_BAR["green"]` resolves to `bg-emerald-500`, `ACCENT_ICON_TINT["green"]` resolves to `bg-emerald-50 text-emerald-700` etc. New code may pass `"green"` via the `Accent` type (it's the canonical positive tone), but **never** hand-roll `bg-green-*` / `text-green-*` Tailwind classes — those are banned per §2 because they produce a different shade than `emerald` and break the "one green family" rule.

Three companion maps (also exported):
- **`ACCENT_BAR`** — `bg-{tone}-500` saturated strip (used for `MiniStatusCard` left accent)
- **`ACCENT_ICON_TINT`** — `bg-{tone}-50 text-{tone}-700 border-{tone}-200 dark:bg-{tone}-950/40 dark:text-{tone}-300 dark:border-{tone}-900` (used for icon tiles in cards, section headers, etc.)
- **`ACCENT_PILL`** — `bg-{tone}-100 text-{tone}-700` (used for filled status pills)

When rendering a colored icon tile, **always** use `ACCENT_ICON_TINT[tone]`. Don't hand-roll the class string.

---

## 16. Accessibility

### Required for clickable elements

- Any clickable `<div>` MUST have `role` (usually `"link"` or `"button"`), `tabIndex={0}`, AND `onKeyDown` for Enter/Space (CLAUDE.md hard rule).
- Use the existing `ClickableRow` primitive whenever possible — it handles all three.
- Add `aria-label` to inner action buttons inside clickable rows so screen readers can disambiguate (e.g. `aria-label="Resolve: Maria Santos · Call back"` on the Open Loops Resolve link).

### Focus states

Use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500` (with `ring-offset-2` outside cards or `ring-inset` for table rows).

### Decorative elements

Mark with `aria-hidden`: status accent strips, dividers, dot indicators, icon tiles that don't carry unique semantic meaning beyond what the adjacent text already says.

### Semantic HTML first

Don't use `<div>` for things that should be `<a>` (links) or `<button>` (actions). The exception is `ClickableRow` for table rows where nesting `<a>` would break HTML.

### Inputs

Default to `bg-stone-50 dark:bg-stone-900/60` for inputs in filter contexts (search bars), so they don't disappear against the page background. The `Input` primitive defaults to `bg-stone-100` which can be invisible — UI-15 audit, partially addressed.

---

## 17. Anti-patterns (things this system rejects)

- ❌ `bg-green-*` for "complete" or "paid" → use `bg-emerald-*` (one green family)
- ❌ `bg-slate-*` → use `bg-stone-*`
- ❌ `rounded-lg` on cards → use `rounded-md`
- ❌ `shadow-sm` on cards → use `shadow-card`
- ❌ `border-stone-100` for structural dividers → use `border-stone-200`
- ❌ `bg-sidebar` on table headers → use `bg-stone-50 dark:bg-stone-900/60` + `text-stone-600`
- ❌ `bg-indigo-50` category headers → use `bg-stone-50` (neutral)
- ❌ Numbered `01/02/03` SectionTitle prefixes → drop `num=`
- ❌ Run-on metadata text "3 drop-offs · 0 pickups · oldest 12 days" → structured metric chunks
- ❌ Customer avatar in `bg-blue-*` → use `bg-violet-*` (customer = violet)
- ❌ Big colored panel chrome on column headers → small icon tile + thin top strip + neutral header
- ❌ "Action Center" / "Inbox" terminology → consolidated into "Open Loops"
- ❌ Local copies of color maps → import `JOB_STATUS_BAR` / `JOB_STATUS_COLORS` from `constants.ts`
- ❌ Hand-rolled `bg-{tone}-50 text-{tone}-700 border-{tone}-200 …` → use `ACCENT_ICON_TINT[tone]`
- ❌ Two greens, two stones, two blues — pick one and stick with it
- ❌ Free-form `className` overrides on layout primitives that punch through their invariants

---

*When this doc gets out of sync with what we've shipped — update this doc first, then the code. Keep CLAUDE.md thin; let this file own design.*
