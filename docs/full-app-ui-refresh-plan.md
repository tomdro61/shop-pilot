# Full-App UI Refresh — Stitch Design Language

## Context

The dashboard has been fully restyled to match the Stitch mockups (borderless cards, shadow-card, generous spacing, big typography). The rest of the app still uses the old style — visible borders, tight spacing, small text, divide-y row separators. This plan applies the dashboard's design language to every remaining page so the entire app feels cohesive.

**Rule: Zero business logic, data fetching, or API changes. Only JSX structure and Tailwind classes.**

---

## Design System Cheat Sheet

| Element | Pattern |
|---------|---------|
| Page padding | `p-4 lg:p-10` (narrow pages keep `max-w-2xl`/`max-w-4xl`) |
| Card | `bg-card rounded-xl shadow-card` — NO `border` |
| Section title (in card) | `text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50` |
| Label/column header | `text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400` |
| Page title | `text-xl font-bold tracking-tight` |
| List row | `rounded-xl px-4 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/50` |
| Row separation | `space-y-1` (NOT `divide-y` or `border-b`) |
| Status badge | `text-[10px] font-black px-2 py-1 rounded-full uppercase` |
| Avatar initials | `w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400` |
| KPI number | `text-3xl lg:text-4xl font-black tabular-nums tracking-tighter` |
| Inline card (non-Card) | `bg-card rounded-xl shadow-card p-5 lg:p-6` |
| Form wrapper | `bg-card rounded-xl shadow-card p-5 lg:p-6` around form |
| Grid gaps | `gap-4 lg:gap-6` |

---

## Step 0: Global Component Updates (cascades everywhere)

### `src/components/ui/card.tsx`
- Remove `border` from Card base: `"bg-card text-card-foreground flex flex-col gap-4 rounded-xl shadow-card py-5"`

### `src/components/ui/table.tsx`
- `TableHeader`: `[&_tr]:border-b` → `[&_tr]:border-0`
- `TableRow`: remove `border-b` from classes
- `TableFooter`: `border-t` → remove (keep `bg-muted/50 font-medium`)

### `npm run build` — verify no breakage

---

## Batch 1: Customer Pages

### `src/app/(dashboard)/customers/page.tsx`
- `p-4 lg:p-8` → `p-4 lg:p-10`

### `src/components/dashboard/customer-list.tsx` (heavy changes)
- Table header: remove `border-b bg-stone-50`, use `text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400`
- Mobile count row: remove `border-b`
- Replace `divide-y` with `space-y-1 p-2`
- Rows: `px-5 py-3 hover:bg-stone-50` → `rounded-xl px-4 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/50`
- Avatar initials: `font-semibold` → `font-bold`
- Customer type badges: borderless pill style

### `src/app/(dashboard)/customers/[id]/page.tsx`
- `max-w-4xl p-4 lg:p-8` → `max-w-4xl p-4 lg:p-10`
- Page title: `font-semibold` → `font-bold`
- Jobs/parking list sections: remove `border-b` from CardHeader, replace `divide-y` with `space-y-1`, row hover to `rounded-xl px-4 py-3.5`
- CardTitle: `text-xs font-semibold uppercase tracking-wider` → `text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400`

### `src/components/dashboard/vehicle-section.tsx`
- Remove `border-b` from CardHeader
- Replace `divide-y` with `space-y-1`
- Rows: rounded hover treatment

### `src/app/(dashboard)/customers/[id]/edit/page.tsx` + `customers/new/page.tsx`
- Padding: `p-4 lg:p-8` → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`

### Loading skeletons (`customers/loading.tsx`, `customers/[id]/loading.tsx`)
- Mirror padding changes

### `npm run build`

---

## Batch 2: Financial Pages

### `src/app/(dashboard)/invoices/page.tsx`
- Padding: `p-4 lg:p-8` → `p-4 lg:p-10`
- Desktop table wrapper: `rounded-lg border border-stone-200 bg-white` → `bg-card rounded-xl shadow-card overflow-hidden`
- Table header: `text-xs font-medium uppercase tracking-wider` → `text-[11px] font-bold uppercase tracking-widest`
- Remove `divide-y` from tbody, remove `border-b` from thead row
- Mobile cards: `rounded-lg border border-stone-200 bg-white` → `bg-card rounded-xl shadow-card`
- Empty state: same border removal
- Add avatar initials on customer names

### `src/app/(dashboard)/quick-pay/page.tsx`
- Padding: `p-4 lg:p-6` → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold`

### `src/app/(dashboard)/estimates/[id]/page.tsx`
- Padding: `p-4 lg:p-8` → `p-4 lg:p-10`

### `npm run build`

---

## Batch 3: Operational Pages

### `src/app/(dashboard)/parking/page.tsx`
- All three tab containers: `p-4 lg:p-8 space-y-5` → `p-4 lg:p-10 space-y-6`

### `src/components/parking/parking-tabs.tsx`
- `rounded-lg` → `rounded-xl`, active tab `rounded-md` → `rounded-lg`

### `src/components/parking/parking-today-view.tsx`
- KPI labels: `text-xs text-stone-500` → `text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400`
- KPI values: `text-2xl font-bold` → `text-3xl font-black tabular-nums tracking-tighter`
- Section headers: `text-sm font-semibold` → `text-lg font-bold tracking-tight`

### `src/components/parking/parking-reservation-card.tsx`
- Full card: `rounded-xl border border-stone-200 bg-white` → `bg-card rounded-xl shadow-card`
- Compact card: `rounded-lg border` → `rounded-xl bg-card shadow-card border-l-4` (keep colored left border for status)
- Name: `font-semibold` → `font-bold`

### `src/components/parking/parking-all-view.tsx` + `parking-service-leads.tsx`
- Empty state: remove `border border-dashed`, use `bg-card rounded-xl shadow-card`

### `src/app/(dashboard)/inspections/page.tsx`
- `max-w-lg p-4 lg:p-8` → `max-w-lg p-4 lg:p-10`
- CardTitle: `text-xs font-semibold uppercase tracking-wider` → `text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50`
- Total separator: soften `border-t` to `border-stone-100/50 dark:border-stone-800/30`

### `src/app/(dashboard)/quote-requests/page.tsx`
- `p-4 lg:p-8` → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`

### `src/components/quote-requests/quote-request-list.tsx`
- Cards: `rounded-xl border border-stone-200 bg-white` → `bg-card rounded-xl shadow-card`
- Name: `font-medium` → `font-bold`
- Status badges: pill pattern

### `npm run build`

---

## Batch 4: Reports Pages

### `src/app/(dashboard)/reports/page.tsx`
- `max-w-2xl p-4 lg:p-8` → `max-w-2xl p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`
- Section headers: `text-xs font-semibold uppercase tracking-[0.06em]` → `text-[11px] font-bold uppercase tracking-widest text-stone-500`
- Report labels: `font-semibold` → `font-bold`

### `src/app/(dashboard)/reports/revenue/page.tsx`
- `p-4 lg:p-8` → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`
- Table CardTitles: → `text-lg font-bold tracking-tight` (section title pattern)
- Table headers: → `text-[11px] font-bold uppercase tracking-widest`
- Remove `border-b` from table rows (handled by table.tsx Step 0)

### `src/app/(dashboard)/reports/tax/page.tsx`
- Same changes as revenue
- YTD row: `border-t-2` → `border-t border-stone-200 dark:border-stone-700`

### `src/components/dashboard/kpi-card.tsx`
- Title: `font-semibold` → `font-bold`
- Card content padding: `p-4` → `p-5`

### `src/components/dashboard/horizontal-bar-chart.tsx`
- CardTitle: → `text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50`

### Loading skeletons (reports/*.loading.tsx)
- Mirror padding changes

### `npm run build`

---

## Batch 5: Admin Pages

### `src/app/(dashboard)/settings/page.tsx`
- `max-w-2xl p-4 lg:p-8` → `max-w-2xl p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`
- Setting labels: `font-semibold` → `font-bold`

### `src/app/(dashboard)/settings/rates/page.tsx`
- Padding → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`

### `src/app/(dashboard)/settings/categories/page.tsx`
- Same as rates

### `src/app/(dashboard)/presets/page.tsx` + `src/components/dashboard/preset-list.tsx`
- Padding → `p-4 lg:p-10`
- CardHeader: remove `border-b`
- CardTitle: → `text-lg font-bold tracking-tight`
- List: `divide-y` → `space-y-1`, rows → `rounded-xl px-4 py-3.5 hover:bg-stone-50`
- Badge: pill pattern

### `src/app/(dashboard)/team/page.tsx` + `src/components/dashboard/team-list.tsx`
- Padding → `p-4 lg:p-10`
- CardHeader: remove `border-b`
- CardTitle: → `text-lg font-bold tracking-tight`
- List: `divide-y` → `space-y-1`, rows → `rounded-xl px-4 py-3.5 hover:bg-stone-50`
- Role badges: pill pattern
- Add avatar initials for team members

### `npm run build`

---

## Batch 6: Jobs Pages (verify + align)

### `src/app/(dashboard)/jobs/page.tsx`
- `p-4 lg:p-8` → `p-4 lg:p-10`

### `src/components/dashboard/jobs-list-view.tsx`
- Mobile cards: `divide-y` → `space-y-1`
- Desktop table: border removal handled by table.tsx Step 0
- Table header text: → `text-[11px] font-bold uppercase tracking-widest`

### `src/app/(dashboard)/jobs/[id]/page.tsx`
- `p-4 lg:p-6` → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold`
- Labels: `tracking-[0.06em]` → `tracking-widest`

### `src/app/(dashboard)/jobs/new/page.tsx` + `jobs/[id]/edit/page.tsx`
- Padding → `p-4 lg:p-10`
- Title: `font-semibold` → `font-bold tracking-tight`

### Job-related loading skeletons
- Mirror padding changes

### `npm run build`

---

## Execution Strategy

1. Do Step 0 (card.tsx + table.tsx) first since it cascades everywhere
2. Work through Batches 1-6 sequentially, building after each batch
3. After all batches, do one final visual pass + build
4. Update PROGRESS.md and STYLE_PATTERNS.md
5. Commit and push to staging

## Estimated Scope

- ~41 files modified
- 2 global component changes (card.tsx, table.tsx)
- ~15 component files
- ~24 page files
- ~5 loading skeleton files
