# ShopPilot UI Refresh — Execution Guide

**Target:** Make ShopPilot feel like Linear / Notion / ShopMonkey — clean, professional, mature.
**Reference product:** Linear (linear.app) — data-dense SaaS with warm neutrals.

Do these in order. Each step is a standalone improvement you can deploy and evaluate before moving on.

---

## Step 1: Switch Font to Inter (30 minutes)

This is the single highest-impact change for the least effort. Geist Sans reads as "developer tool." Inter reads as "professional SaaS product."

### What to do:

**`src/app/layout.tsx`** — Replace the Geist font imports with Inter:
```tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
```

Apply `inter.variable` to the `<body>` or `<html>` className, and remove the Geist font variables.

**`src/app/globals.css`** — Update the theme inline font reference:
```css
--font-sans: var(--font-inter);
```

Remove `--font-geist-sans` and `--font-geist-mono` references (keep a mono font if you use it anywhere for code/numbers — if so, keep Geist Mono or use JetBrains Mono).

**Why:** Inter has better optical sizing at 11–14px (where most of your UI text lives), slightly warmer letterforms that harmonize with the stone palette, and is the de facto standard for modern SaaS dashboards. ShopMonkey, Linear, Vercel's own dashboard — all use Inter or Inter-adjacent fonts.

---

## Step 2: Card Depth — Add Shadows, Fix Padding (45 minutes)

Cards currently have only a border and no shadow. In light mode they feel flat. Adding a whisper of shadow creates the "floating surface" effect your design system describes.

### What to do:

**`src/components/ui/card.tsx`** — Update the Card component base classes:

Change:
```
"bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-5"
```

To:
```
"bg-card text-card-foreground flex flex-col gap-4 rounded-xl border shadow-[0_1px_3px_0_rgb(0_0_0_/0.04),0_1px_2px_-1px_rgb(0_0_0_/0.04)] dark:shadow-none py-5 px-5"
```

Key changes:
- Added `shadow-[...]` — barely visible in light mode, disabled in dark mode (borders are enough there)
- Added `px-5` at the card level so all children have consistent horizontal padding
- You'll need to remove `px-5` from CardHeader and CardContent to avoid double-padding

**Update CardHeader** — remove `px-5`:
```
"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5"
```

**Update CardContent** — remove `px-5`:
```
""
```
(Yes, empty string — the card's padding handles it now)

**Update CardFooter** — remove `px-5`:
```
"flex items-center [.border-t]:pt-5"
```

**Why:** Consistent padding from the card container means every section within a card aligns perfectly. The shadow adds just enough depth to separate the surface from the stone-100 background without looking heavy.

---

## Step 3: Strict Spacing Grid (1–2 hours)

This is the hardest step but the most impactful for eliminating the "clunky" feeling. The goal is to use ONLY these spacing values throughout the entire app:

- **4px** (p-1) — icon gaps, badge padding
- **8px** (p-2, gap-2) — tight element spacing within a row
- **12px** (p-3, gap-3, mb-3) — label-to-content gaps
- **16px** (p-4, gap-4) — standard card internal spacing
- **24px** (p-6, gap-6) — between cards, page padding on mobile
- **32px** (p-8, gap-8) — between major page sections
- **48px** — top of page before first content (rarely used)

### What to do:

**`src/app/(dashboard)/dashboard/page.tsx`** — Standardize the dashboard grid:

Find all the grid gaps and standardize:
- Page container: `p-6 lg:p-8` (currently `p-4 lg:p-6` — too tight)
- Gap between major sections (Quick Actions → Revenue → Shop Floor → Lists): `gap-8` (currently mixed `gap-3`, `gap-7`)
- Gap between cards within a section: `gap-4` (currently mixed)
- Section heading to content below: `mb-3` (12px) — this is correct, keep it
- Section heading top margin (breathing room above): `mt-8` for each section heading (or `pt-8` on the section wrapper)

The key rule: **every section heading should have at least 32px of space above it.** This is the #1 thing that will make it feel organized vs. cramped.

**All pages** — Apply the same spacing discipline:
- Job detail page: `p-6 lg:p-8` for the container, `gap-6` between card sections
- Customer detail page: same pattern
- Reports page: same pattern

---

## Step 4: Refine the Sidebar (30 minutes)

### What to do:

**`src/components/layout/sidebar.tsx`** — Increase width and item size:

Change sidebar width:
```
lg:w-56 → lg:w-60
```

Change nav item padding:
```
px-2.5 py-2 → px-3 py-2.5
```

Change icon size:
```
h-4 w-4 → h-[18px] w-[18px]
```

Change the brand section padding:
```
h-14 → h-16
px-5 → px-6
```

Make the brand text slightly larger:
```
text-[15px] → text-base (16px)
```

Add a subtle bottom shadow to the brand section instead of just a border:
```
border-b → border-b shadow-[0_1px_2px_0_rgb(0_0_0_/0.03)] dark:shadow-none
```

**Why:** The sidebar is the first thing you see. Making items slightly larger and more generously spaced signals "polished product" rather than "I fit everything in." 240px is the sweet spot — enough to show labels without wrapping, not so wide it eats content area.

Also update `src/app/(dashboard)/layout.tsx`:
```
lg:w-56 → lg:w-60
```
(if the sidebar width is referenced there too — check how the flex layout works)

---

## Step 5: Card Hover States + Transitions (30 minutes)

### What to do:

**All clickable cards/rows** — Add subtle hover elevation:

For clickable list rows (dashboard recent jobs, pending estimates, etc.):
```
hover:bg-stone-50 dark:hover:bg-stone-800
→
hover:bg-stone-50/80 dark:hover:bg-stone-800/80 transition-all duration-150
```

For clickable cards (shop floor cards, etc.), add a hover lift:
```
transition-all duration-150 hover:shadow-[0_2px_8px_0_rgb(0_0_0_/0.06)] hover:-translate-y-[1px]
```

**All buttons** — Already have `transition-colors`, but change to `transition-all` for slightly smoother feel.

**Page load animations** — Your `animate-in-up` class exists in CSS but may not be applied consistently. Add it to:
- The page container div on dashboard: `animate-in-up`
- Each major section with stagger: `animate-in-up stagger-1`, `stagger-2`, etc.
- The header section on job detail: already has `animate-in-up`, keep it

**Why:** Micro-interactions are the difference between "it works" and "it feels good." The hover lift on cards creates a sense that elements are interactive surfaces, not just rectangles.

---

## Step 6: Reduce Dashboard Visual Patterns (1 hour)

This is a design consolidation step. The dashboard currently uses too many distinct component styles.

### What to do:

**Unify the "data row" pattern.** Every list on the dashboard (Recent Jobs, Unpaid Jobs, Pending Estimates, Today's Schedule) should use the exact same row component with the same padding, typography, and hover style:

```
Container: rounded-xl border bg-card shadow-[...]
Row:       px-5 py-3.5 flex items-center justify-between transition-all duration-150 hover:bg-stone-50/80 dark:hover:bg-stone-800/80
Name:      text-sm font-medium text-stone-900 dark:text-stone-50
Secondary: text-xs text-stone-500 dark:text-stone-400
Amount:    text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-50
Divider:   border-b border-stone-100 dark:border-stone-800 (between rows, not on last)
Empty:     py-10 (not py-8) with icon + text centered
```

Create a shared `DashboardListRow` component if one doesn't exist. Use it for all four lists.

**Unify stat cards.** The revenue stat cards at the top should all follow one pattern:
```
Rounded-xl border bg-card shadow-[...] p-5
Label:  text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-400 dark:text-stone-500
Value:  text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 mt-1
Trend:  text-xs font-medium mt-1.5 (green for up, red for down)
```

No left-border accents on stat cards — they add visual noise without information value. If you want differentiation, use a very subtle icon in the top-right corner (DollarSign for revenue, Wrench for labor, Package for parts) in stone-300/stone-600 at h-4 w-4.

**Shop floor cards** — Keep the left-border accent here (it's the one place it adds value — color-coding job status). But make sure all three cards (In Progress, Waiting, Not Started) use identical internal spacing.

---

## Step 7: Header Polish (20 minutes)

### What to do:

**`src/components/layout/header.tsx`** — Small tweaks:

The page title on desktop (`lg:text-base`) is too small for a page header. Change to:
```
lg:text-base → lg:text-lg font-semibold tracking-tight
```

The header height `h-14` is fine but feels slightly cramped with the larger sidebar. Consider `h-15` or `h-16` for a bit more breathing room. On mobile where it shows the brand, this is especially important.

The backdrop blur is good (`backdrop-blur-xl`). Add a slightly more visible border in light mode — currently `border-stone-200` which is very subtle against white. This is fine; don't change it.

---

## Step 8: Form Input Polish (30 minutes)

### What to do:

Find all your form input components (likely in `src/components/ui/input.tsx`, `select.tsx`, `textarea.tsx`) and ensure they all use:

```
h-10 (40px height — slightly taller than the default h-9)
rounded-lg (8px — not rounded-md which is 6px)
border-stone-300 dark:border-stone-700 (slightly more visible border)
text-sm
px-3.5 (14px horizontal padding)
focus:ring-2 focus:ring-blue-600/10 dark:focus:ring-blue-500/20
focus:border-blue-600 dark:focus:border-blue-500
placeholder:text-stone-400 dark:placeholder:text-stone-600
transition-colors duration-150
```

The key difference from the default shadcn input: taller (h-10 vs h-9), more visible border (stone-300 vs stone-200), and a colored focus ring that's very subtle (10-20% opacity).

---

## Step 9: Color Harmony Fix (30 minutes)

### What to do:

The warm stone palette + cool blue-600 clash is real but fixable without changing every file. The simplest fix:

**`src/app/globals.css`** — Shift primary from blue-600 to a slightly warmer blue:

Change:
```css
--primary: oklch(0.55 0.2 260);  /* blue-600, cool */
```

To:
```css
--primary: oklch(0.55 0.18 255);  /* slightly warmer, pushed toward indigo */
```

And in dark mode:
```css
--primary: oklch(0.62 0.18 260);  /* current */
```

To:
```css
--primary: oklch(0.62 0.16 255);  /* slightly warmer to match */
```

This is a 5-degree hue shift that most people won't consciously notice, but it harmonizes the blue with the stone warmth. If this feels too subtle, you could go to 250 (more indigo) but stay above 245 or it'll look purple.

**Alternative (bolder move):** Switch from stone to slate/zinc for neutrals. This matches cool blue perfectly. But this is a much bigger change touching every file, so only do this if the hue shift isn't enough.

---

## Summary: Session Order

| Session | What | Time Est. | Impact |
|---------|------|-----------|--------|
| 1 | Font swap (Inter) + Card shadows + Sidebar width | 1.5 hrs | Very High |
| 2 | Spacing grid standardization (dashboard + job detail) | 1.5 hrs | Very High |
| 3 | Dashboard pattern consolidation (unified rows, stat cards) | 1 hr | High |
| 4 | Hover states + micro-interactions + page animations | 30 min | Medium |
| 5 | Form inputs + header + color harmony | 1 hr | Medium |

**Total: ~5.5 hours across 5 sessions.**

---

## How to Prompt Claude Code

For each session, give Claude Code this context:

```
Read SHOPPILOT_DESIGN_SYSTEM.md and the UI refresh guide at UI_REFRESH_GUIDE.md.
I'm doing Step [N] of the refresh. Here's what needs to change:
[paste the relevant step from this guide]

Rules:
- Don't change any functionality — layout and styling only
- Every class must include both light and dark mode variants
- Test with `npm run build` before committing
- Update PROGRESS.md with what changed
```

---

## What "Done" Looks Like

After all 5 sessions, ShopPilot should feel like:
- **Inter font** throughout — warmer, more professional
- **Cards float** above the background with subtle shadows
- **Consistent spacing** — no more tight/loose mixing, everything on the 8/16/24/32 grid
- **Sidebar feels substantial** — 240px, larger items, more breathing room
- **Dashboard is calm** — 2-3 visual patterns max, repeated consistently
- **Everything responds to hover** — subtle but present
- **Colors harmonize** — warm neutrals + warmed blue, no clash

The goal is not "redesign." The goal is "tighten what exists until it feels inevitable."
