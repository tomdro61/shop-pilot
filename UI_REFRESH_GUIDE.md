# ShopPilot UI Refresh — Complete Execution Guide

**Goal:** Transform ShopPilot from "functional" to "beautiful and calm" — like Linear, Stripe Dashboard, or Vercel.

**North star products to reference:**
- **Linear** (linear.app) — The gold standard for data-dense SaaS. Warm gray palette, Inter font, calm hierarchy, near-instant performance feel. Their recent redesign blog posts describe "reducing visual noise" and "making navigation recede while content takes focus."
- **Stripe Dashboard** — Clean data presentation, generous whitespace, subtle depth cues, perfect typography scale
- **Vercel Dashboard** — Monochrome with selective color, information density done right

**What makes these products feel "beautiful but simple":**
1. **Restraint** — They show less, not more. Every element earns its place.
2. **Consistent rhythm** — Spacing is mathematical. You can feel the grid even if you can't see it.
3. **Hierarchy through typography, not decoration** — Big numbers speak. Labels whisper. No borders or icons needed to create structure.
4. **Surfaces recede, content advances** — Navigation is dimmer than content. Chrome is invisible. Your eye goes to the data.
5. **Color is used surgically** — 90% of the UI is grayscale. Color appears only for status, actions, and alerts.

---

## The 5 Principles for This Refresh

### Principle 1: "The navigation should disappear"
Linear's recent refresh specifically dimmed their sidebar so the main content takes focus. The sidebar exists for wayfinding, not as a visual element. It should feel like it's behind glass — present but not competing with your dashboard data.

**For ShopPilot:** The sidebar background should be the same as or slightly darker than the main content background — NOT bright white against stone-100. This is the opposite of what most templates do, but it's what Linear, Notion, and Vercel all converge on. The active state should be the only thing that pops.

### Principle 2: "Typography IS the design"
In the best dashboards, you could remove every border, every background color, every icon — and the hierarchy would still be clear from font size and weight alone. That's the test.

**For ShopPilot:** Metric values should be 2–3x the size of their labels. Page titles should be clearly the largest thing on screen. Section headings should be small enough that they organize without shouting.

### Principle 3: "One pattern, repeated perfectly"
Linear uses ONE card style. ONE list row style. ONE badge style. Repeated everywhere. The consistency itself communicates quality. Every unique component variation is a tax on perceived polish.

**For ShopPilot:** The dashboard currently has stat cards, shop floor cards, list sections, alert bars — all with slightly different padding, borders, and treatments. Reduce to 2 card types max: a "metric card" and a "list card."

### Principle 4: "Whitespace is the luxury"
The difference between a $50/mo tool and a $500/mo tool is often just whitespace. Generous padding signals confidence. Cramped layouts signal "we're trying to fit everything in."

**For ShopPilot:** Page padding should be 32px on desktop. Card padding should be 24px. Section gaps should be 32–40px. The dashboard should feel like it has room to breathe.

### Principle 5: "Color only when it means something"
Linear is 95% grayscale. Blue appears for active states and links. Status colors appear on badges. Everything else is gray. This makes the colored elements actually stand out.

**For ShopPilot:** Remove decorative color (left-border accents on stat cards, colored icon backgrounds). Let status badges and action buttons be the only colored elements. The restraint will make the dashboard feel calmer and more professional.

---

## Session 1: Font + Surfaces + Sidebar (The Foundation)

### 1A. Switch to Inter

**`src/app/layout.tsx`:**
- Remove Geist Sans and Geist Mono imports
- Add: `import { Inter, JetBrains_Mono } from "next/font/google"`
- Configure Inter with `subsets: ["latin"], variable: "--font-inter", display: "swap"`
- Configure JetBrains Mono with `subsets: ["latin"], variable: "--font-mono", display: "swap"` (for any monospace needs like RO numbers, amounts)
- Apply both variables to `<html>` or `<body>` className

**`src/app/globals.css`:**
- Change `--font-sans: var(--font-geist-sans)` → `--font-sans: var(--font-inter)`
- Change `--font-mono: var(--font-geist-mono)` → `--font-mono: var(--font-mono)` (or just keep JetBrains Mono)

### 1B. Card Shadows (SAFE approach — no padding changes)

**`src/components/ui/card.tsx`:**
- DO NOT touch CardHeader, CardContent, or CardFooter padding. Leave them exactly as they are.
- ONLY change the Card component base classes.

Change:
```
"bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-5"
```
To:
```
"bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-5 shadow-[0_1px_2px_0_rgb(0_0_0_/0.03),0_1px_3px_0_rgb(0_0_0_/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/0.04)]"
```

This adds a barely-visible shadow in light mode (depth cue) and a super-subtle inner glow in dark mode (surface distinction). Nobody will consciously notice it — but the cards will feel like they "float."

### 1C. Sidebar: Make It Recede

This is the biggest visual change and will have the most impact on perceived quality.

**`src/components/layout/sidebar.tsx`:**

Width: `lg:w-56` → `lg:w-60`

Background: Change from bright white to match/blend with the page:
```
lg:bg-white dark:lg:bg-stone-900
```
→
```
lg:bg-stone-50 dark:lg:bg-stone-925
```

Note: stone-925 doesn't exist in Tailwind. Use the arbitrary value:
```
dark:lg:bg-[#161412]
```
This is halfway between stone-900 (#1C1917) and stone-950 (#0C0A09). The sidebar becomes slightly darker than the content cards but lighter than the page background in dark mode. In light mode, stone-50 is slightly warmer than white, making it recede behind the white content cards.

Border: Change from hard line to softer:
```
lg:border-r lg:border-stone-200 dark:lg:border-stone-800
```
→
```
lg:border-r lg:border-stone-200/60 dark:lg:border-stone-800/40
```

Nav items — increase size slightly:
- Item padding: `px-2.5 py-2` → `px-3 py-2`
- Item text: keep `text-sm` but ensure `leading-relaxed` or `leading-6`
- Icon size: `h-4 w-4` → `h-[18px] w-[18px]`
- Item gap: `gap-2.5` → `gap-3`

Brand section:
- Height: `h-14` → `h-16`
- Padding: `px-5` → `px-6`
- Brand name: `text-[15px]` → `text-base` (16px)
- Tagline: keep `text-[10px]`

Active nav item — make it the ONLY bright thing:
Keep the current blue-50/blue-950 background treatment. It's correct. The dimmer sidebar makes the active state pop even more.

**Also update `src/app/(dashboard)/layout.tsx`** if it references sidebar width classes.

### 1D. Header: Calm Down

**`src/components/layout/header.tsx`:**

The page title `text-sm font-semibold lg:text-base` is too small. The header should provide clear orientation.

Change title to:
```
text-base font-semibold tracking-tight lg:text-lg
```

Keep backdrop blur and border as-is. These are good.

---

## Session 2: Spacing Rhythm (The Grid)

Every piece of spacing in the app should come from this scale: **8, 12, 16, 24, 32, 40**

### 2A. Page Container Spacing

**All page containers** (dashboard, jobs list, customer list, job detail, reports):

Mobile: `p-5` (20px)
Desktop: `lg:p-8` (32px)

Currently they're `p-4 lg:p-6`. This extra breathing room is what separates "functional" from "premium."

### 2B. Section Spacing

Between major dashboard sections (Quick Actions → Revenue → Shop Floor → Lists):

Use `space-y-10` or explicit `mt-10` (40px) between each major section. Currently it's mixed `gap-3` and `gap-7` which creates an uneven rhythm.

Within a section (e.g., the four stat cards): `gap-4` (16px)

### 2C. Section Heading Rhythm

Every section heading should follow this exact pattern:
```
<div className="mt-10 first:mt-0">
  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400 dark:text-stone-500">
    Revenue
  </h2>
  {/* content */}
</div>
```

The `mt-10 first:mt-0` ensures 40px above every section heading EXCEPT the first one on the page. This consistent breathing room is what creates the sense of organized calm.

### 2D. List Row Spacing

Every list row (recent jobs, unpaid, pending estimates, scheduled):
```
px-5 py-3.5
```

Not `px-4 py-2.5` (too tight) and not `px-6 py-4` (too loose). 3.5 (14px vertical) hits the sweet spot for data density with breathing room.

---

## Session 3: Component Consolidation

### 3A. Create a Unified Stat Card

Create `src/components/dashboard/stat-card.tsx`:

```tsx
interface StatCardProps {
  label: string;
  value: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  subtitle?: string;
}
```

Design:
```
Card (rounded-xl border shadow-[...])
  p-5
  Label: text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400 dark:text-stone-500
  Value: text-[28px] font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-1.5 tabular-nums
  Trend: text-xs font-medium mt-1 (text-emerald-600 for up, text-red-500 for down)
```

NO left-border accents. NO colored backgrounds. NO icons. Just label → big number → trend. The simplicity IS the design.

Replace all 4+ stat card implementations on the dashboard with this single component.

### 3B. Create a Unified List Section

Create `src/components/dashboard/list-section.tsx`:

```tsx
interface ListSectionProps {
  title: string;
  viewAllHref?: string;
  emptyIcon: React.ReactNode;
  emptyMessage: string;
  children: React.ReactNode;
}
```

Design:
```
Section heading (11px uppercase tracking)
Card container (rounded-xl border shadow)
  Rows: divide-y divide-stone-100 dark:divide-stone-800/50
  Each row: px-5 py-3.5 flex items-center justify-between
  Row hover: hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition-colors duration-100
  Empty state: py-12 centered, icon h-5 text-stone-300, message text-sm text-stone-400
```

View all link in the section heading: `text-[11px] font-medium text-stone-400 hover:text-stone-600 uppercase tracking-[0.08em]` — same style as the heading itself, just interactive.

### 3C. Create a Unified List Row

Create `src/components/dashboard/list-row.tsx`:

```tsx
interface ListRowProps {
  href: string;
  primary: string;      // Customer name
  secondary?: string;   // Vehicle or job title
  value?: string;       // Dollar amount
  badges?: React.ReactNode;
}
```

Design:
```
Primary:   text-sm font-medium text-stone-900 dark:text-stone-50 truncate
Secondary: text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5
Value:     text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-50
```

Use this for Recent Jobs, Unpaid Jobs, Pending Estimates, and Today's Schedule. Same component. Same spacing. Same typography.

### 3D. Shop Floor Cards — Keep Unique but Tighten

The shop floor cards (In Progress, Waiting, Not Started) are the ONE place where the left-border accent makes sense because the color maps to job status. Keep these, but ensure they use identical internal spacing.

---

## Session 4: Micro-Interactions

### 4A. Page Load Animation

Add `animate-in-up` to the main page container on dashboard:
```tsx
<div className="animate-in-up p-5 lg:p-8 space-y-10">
```

Don't stagger individual sections — one smooth entrance for the whole page. Staggering each section creates a "loading" feeling rather than an "arriving" feeling.

### 4B. Hover States

Clickable cards (shop floor, etc.):
```
transition-all duration-150 hover:shadow-[0_2px_8px_0_rgb(0_0_0_/0.06)] dark:hover:shadow-[0_0_0_1px_rgb(255_255_255_/0.06)] hover:-translate-y-px
```

This is subtle — 1 pixel lift and slightly more shadow. Enough to feel interactive, not enough to be distracting.

List rows: keep simple `hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition-colors duration-100` — no transforms on rows, just background.

### 4C. Button Transitions

All buttons: change `transition-colors` to `transition-all duration-150` so hover darkening is smooth.

Primary button — add subtle scale on active:
```
active:scale-[0.98]
```

---

## Session 5: Color + Typography + Forms

### 5A. Warm the Blue (5-degree hue shift)

**`src/app/globals.css`:**

Light mode primary:
```css
--primary: oklch(0.55 0.2 260);
```
→
```css
--primary: oklch(0.55 0.17 252);
```

Dark mode primary:
```css
--primary: oklch(0.62 0.18 260);
```
→
```css
--primary: oklch(0.62 0.16 252);
```

This shifts the blue from a cool, saturated blue toward a warmer slate-blue/indigo that harmonizes with the warm stone grays. Slightly reduced chroma (0.17 instead of 0.2) also prevents the blue from "vibrating" against the warm background.

### 5B. Tabular Numbers for All Data

Any place that shows dollar amounts, counts, or dates should use `tabular-nums` (monospace figures) so columns align and numbers don't jump around as they change.

Add to your globals.css:
```css
.tabular-nums { font-variant-numeric: tabular-nums; }
```

Ensure stat card values, list row amounts, and table cells all have this class.

### 5C. Form Input Refinement

**`src/components/ui/input.tsx` (and select, textarea):**

Target appearance: `h-10 rounded-lg text-sm`

Key classes to ensure:
```
h-10
rounded-lg
bg-white dark:bg-stone-900
border border-stone-200 dark:border-stone-800
text-sm text-stone-900 dark:text-stone-100
placeholder:text-stone-400 dark:placeholder:text-stone-500
px-3.5
focus:border-blue-500 dark:focus:border-blue-400
focus:ring-2 focus:ring-blue-500/10 dark:focus:ring-blue-400/10
transition-colors duration-150
```

The border changes from stone-300 to stone-200 for a softer default, and the focus ring is very low opacity (10%) so it's a gentle glow rather than a harsh outline.

---

## Prompt for Claude Code

For each session, give Claude Code this:

```
Read the files:
- SHOPPILOT_DESIGN_SYSTEM.md (existing design system)
- UI_REFRESH_GUIDE.md (this file — the execution plan)

I'm doing Session [N] of the UI refresh.

Rules:
1. Styling and layout changes ONLY. Do not change any data fetching, server actions, API routes, or business logic.
2. Every Tailwind class must include both light and dark mode variants where applicable.
3. DO NOT modify CardHeader, CardContent, or CardFooter padding in card.tsx. Only add shadow to the Card wrapper.
4. Run `npm run build` after every file change to catch errors immediately.
5. Update PROGRESS.md with what changed.
6. When creating new shared components, put them in src/components/dashboard/.
7. Keep the stone color palette — do not switch to slate or zinc.
```

---

## What "Done" Looks Like

After 5 sessions, ShopPilot should feel:
- **Calm** — Whitespace and consistent rhythm create a sense of order
- **Professional** — Inter font, tabular numbers, restrained color
- **Confident** — Big numbers, clear hierarchy, no decoration competing for attention
- **Responsive** — Everything has a hover state, everything transitions smoothly
- **Unified** — One stat card, one list row, one badge style, repeated everywhere

The test: if you screenshot the dashboard and show it to someone who's never seen ShopPilot, they should say "that looks like a real product" — not "that looks like a side project."
