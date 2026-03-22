# ShopPilot — Style Patterns

Standard Tailwind class patterns for consistent UI across the app.

## Page Container

```
p-4 lg:p-8
```

With max-width (forms/detail pages): `mx-auto max-w-2xl p-4 lg:p-8` or `max-w-4xl`

## Section Heading

```
text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500
```

Margin below: `mb-4`

## Stat Card (Revenue)

```
rounded-xl border bg-card p-5 shadow-card
```

- Label: `text-[10px] font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500`
- Value: `text-3xl lg:text-4xl font-black tabular-nums tracking-tight text-stone-900 dark:text-stone-50`

## KPI Card (with accent border)

Uses `<Card>` component with `border-l-4 border-l-{color}-500`

- Label: `text-[10px] font-semibold uppercase tracking-widest`
- Value: `text-3xl lg:text-4xl font-black tabular-nums tracking-tight`

## Trend Pill

```
inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
```

- Positive: `bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400`
- Negative: `bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400`
- Neutral: `bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400`

## Day Count Badge

```
text-[10px] font-medium px-1.5 py-0.5 rounded-full
```

- Aging (3+ days): `bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400`
- Warning (2-4 days): `bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400`
- Normal: `bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400`

## Card (shadcn)

Rendered by `<Card>` component: `rounded-xl border shadow-card`

The `shadow-card` utility is defined in `globals.css` and provides a subtle stone-tinted box shadow in light mode (disabled in dark mode).

## Left-Border Accent Card (Shop Floor)

```
rounded-xl border border-l-[3px] border-l-{color}-500 bg-card p-5 shadow-card
```

Colors: `blue`, `amber`, `stone`

## List Card (no padding — rows provide their own)

```
rounded-xl border bg-card shadow-card
```

List rows: `px-4 py-2.5` with `divide-y` on parent

## Table Row (hover)

```
transition-colors hover:bg-stone-50 dark:hover:bg-stone-800
```

## Badge (status)

Borderless pill with tinted background:

```
text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-{color}-100 dark:bg-{color}-950 text-{color}-700 dark:text-{color}-400
```

## Sidebar

Permanently dark (`bg-stone-900`) regardless of light/dark theme. Active nav item uses blue pill (`bg-blue-600 text-white`). Inactive items: `text-stone-400 hover:bg-stone-800 hover:text-stone-100`.

## Input

Height: `h-10` (via shadcn `Input` component)

## Grid Gaps

- Stat/card grids: `gap-4`
- Section grids (2-col): `gap-8 lg:gap-4`
