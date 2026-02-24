# ShopPilot Design System

## Overview

ShopPilot is a shop management system for an auto repair business. The UI should feel **clean, modern, and professional** — like a well-designed SaaS product (think Linear, Notion, or Stripe Dashboard). It should NOT look like a generic Bootstrap template.

The key principle: **layered backgrounds for depth** — content surfaces float above the page background. In light mode that's white cards on warm gray. In dark mode it's lighter dark cards on a darker base. Same spatial logic, inverted palette.

**The app supports light and dark themes** (system preference with manual toggle). Every component MUST include both light and dark mode classes using Tailwind's `dark:` prefix. Never style for light only.

---

## 1. Color Palette

### CRITICAL: How to Apply Colors

Every color in this system has a light AND dark value. When writing Tailwind classes, ALWAYS include both:
```
bg-stone-100 dark:bg-stone-950      ← page background
bg-white dark:bg-stone-900           ← card/surface
text-stone-900 dark:text-stone-100   ← primary text
border-stone-200 dark:border-stone-800  ← borders
```

### Background Layers (Creating Depth)
These are the most important colors in the system. The #1 problem right now is everything is the same shade, so nothing has depth. The fix is the same for both themes: the base background is darker/muted, and surfaces (cards) are lighter/brighter.

| Token | Light Value | Dark Value | Tailwind | Usage |
|-------|------------|------------|----------|-------|
| `--bg-base` | `#F5F5F4` (stone-100) | `#0C0A09` (stone-950) | `bg-stone-100 dark:bg-stone-950` | **Page background.** Everything behind content. |
| `--bg-surface` | `#FFFFFF` | `#1C1917` (stone-900) | `bg-white dark:bg-stone-900` | **Cards, panels, modals.** Surfaces float on the base. |
| `--bg-surface-hover` | `#FAFAF9` (stone-50) | `#292524` (stone-800) | `bg-stone-50 dark:bg-stone-800` | Hover state for interactive surfaces. |
| `--bg-surface-sunken` | `#F5F5F4` (stone-100) | `#0C0A09` (stone-950) | `bg-stone-100 dark:bg-stone-950` | Inset areas within cards (line item rows, etc). |
| `--bg-sidebar` | `#FFFFFF` | `#1C1917` (stone-900) | `bg-white dark:bg-stone-900` | Sidebar background. |

### Text Colors
| Token | Light Value | Dark Value | Tailwind | Usage |
|-------|------------|------------|----------|-------|
| `--text-primary` | `#1C1917` (stone-900) | `#FAFAF9` (stone-50) | `text-stone-900 dark:text-stone-50` | Headlines, names, amounts |
| `--text-secondary` | `#57534E` (stone-600) | `#A8A29E` (stone-400) | `text-stone-600 dark:text-stone-400` | Descriptions, labels |
| `--text-tertiary` | `#A8A29E` (stone-400) | `#78716C` (stone-500) | `text-stone-400 dark:text-stone-500` | Placeholders, timestamps |
| `--text-on-primary` | `#FFFFFF` | `#FFFFFF` | `text-white` | Text on primary buttons (same both themes) |

### Primary Brand Color (Actions & Interactive)
| Token | Light Value | Dark Value | Tailwind | Usage |
|-------|------------|------------|----------|-------|
| `--primary` | `#2563EB` (blue-600) | `#3B82F6` (blue-500) | `bg-blue-600 dark:bg-blue-500` | Primary buttons, active nav, links |
| `--primary-hover` | `#1D4ED8` (blue-700) | `#2563EB` (blue-600) | `hover:bg-blue-700 dark:hover:bg-blue-600` | Hover state |
| `--primary-light` | `#EFF6FF` (blue-50) | `#172554` (blue-950) | `bg-blue-50 dark:bg-blue-950` | Selected states, active sidebar, info callouts |
| `--primary-border` | `#BFDBFE` (blue-200) | `#1E3A5F` (blue-900) | `border-blue-200 dark:border-blue-900` | Border for active elements |
| `--primary-text` | `#1D4ED8` (blue-700) | `#60A5FA` (blue-400) | `text-blue-700 dark:text-blue-400` | Link text, active nav text |

### Status Colors

In dark mode, status colors use deeper/darker tinted backgrounds with lighter text. The pattern is: `-50` backgrounds become `-950` or `-900/alpha` backgrounds, and `-700` text becomes `-400` text.

| Status | Light BG | Dark BG | Light Text | Dark Text | Tailwind BG | Tailwind Text |
|--------|---------|---------|-----------|-----------|-------------|---------------|
| **Not Started** | stone-100 | stone-800 | stone-600 | stone-400 | `bg-stone-100 dark:bg-stone-800` | `text-stone-600 dark:text-stone-400` |
| **In Progress** | blue-50 | blue-950 | blue-700 | blue-400 | `bg-blue-50 dark:bg-blue-950` | `text-blue-700 dark:text-blue-400` |
| **Waiting** | amber-50 | amber-950 | amber-700 | amber-400 | `bg-amber-50 dark:bg-amber-950` | `text-amber-700 dark:text-amber-400` |
| **Complete** | green-50 | green-950 | green-700 | green-400 | `bg-green-50 dark:bg-green-950` | `text-green-700 dark:text-green-400` |
| **Paid** | green-50 | green-950 | green-700 | green-400 | `bg-green-50 dark:bg-green-950` | `text-green-700 dark:text-green-400` |
| **Unpaid** | red-50 | red-950 | red-700 | red-400 | `bg-red-50 dark:bg-red-950` | `text-red-700 dark:text-red-400` |
| **Draft** | stone-100 | stone-800 | stone-500 | stone-500 | `bg-stone-100 dark:bg-stone-800` | `text-stone-500` |

### Borders & Dividers
| Token | Light Value | Dark Value | Tailwind | Usage |
|-------|------------|------------|----------|-------|
| `--border-default` | `#E7E5E4` (stone-200) | `#292524` (stone-800) | `border-stone-200 dark:border-stone-800` | Card borders, dividers |
| `--border-strong` | `#D6D3D1` (stone-300) | `#44403C` (stone-700) | `border-stone-300 dark:border-stone-700` | Sidebar border, emphasized |
| `--border-subtle` | `#F5F5F4` (stone-100) | `#292524` (stone-800) | `border-stone-100 dark:border-stone-800` | List row dividers |
| `--border-focus` | `#2563EB` (blue-600) | `#3B82F6` (blue-500) | `focus:border-blue-600 dark:focus:border-blue-500` | Input focus ring |

### Semantic Accent Colors (for charts, categories, highlights)
These stay the same in both themes — they're already mid-range colors that work on both light and dark backgrounds.

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-blue` | `#3B82F6` | Charts, category indicators |
| `--accent-emerald` | `#10B981` | Positive metrics, revenue |
| `--accent-amber` | `#F59E0B` | Warnings, attention |
| `--accent-red` | `#EF4444` | Negative metrics, overdue, delete |
| `--accent-purple` | `#8B5CF6` | Inspections, secondary category |
| `--accent-slate` | `#64748B` | Neutral category |

---

## 2. Typography

Use **Inter** for UI text (it's excellent for data-heavy interfaces) and keep it tight and purposeful.

If you want more character, use **DM Sans** or **Plus Jakarta Sans** as alternatives — they're slightly warmer than Inter.

| Element | Size | Weight | Color | Letter Spacing |
|---------|------|--------|-------|----------------|
| Page title | 24px (text-2xl) | 700 (bold) | `--text-primary` | -0.025em |
| Section heading | 13px (text-xs) | 600 (semibold) | `--text-tertiary` | 0.05em (uppercase) |
| Card title / Name | 16px (text-base) | 600 (semibold) | `--text-primary` | -0.01em |
| Body text | 14px (text-sm) | 400 (regular) | `--text-secondary` | 0 |
| Small label | 12px (text-xs) | 500 (medium) | `--text-tertiary` | 0 |
| Metric / Big number | 28px (text-3xl) | 700 (bold) | `--text-primary` | -0.025em |
| Metric label | 11px | 600 (semibold) | `--text-tertiary` | 0.06em (uppercase) |

### Section Headings Pattern
Section headings (like "REVENUE", "OPERATIONS", "RECENT JOBS", "LINE ITEMS", "SHOP FLOOR") should be:
- ALL CAPS
- 11-13px
- Semibold (600)
- Color: `--text-tertiary` (stone-400)
- Letter-spacing: 0.05-0.06em
- Margin-bottom: 12-16px

This creates clear visual breaks between sections without using heavy dividers.

---

## 3. Spacing & Layout

### Page Layout
```
┌─────────────────────────────────────────────┐
│ Sidebar (240px)  │  Main Content Area       │
│ bg: white        │  bg: stone-100           │
│ border-right:    │  padding: 24-32px        │
│ stone-200        │                          │
│                  │  ┌─────────────────────┐  │
│                  │  │ White Card          │  │
│                  │  │ (surface)           │  │
│                  │  └─────────────────────┘  │
│                  │                          │
│                  │  ┌─────────────────────┐  │
│                  │  │ White Card          │  │
│                  │  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **Main content background**: `--bg-base` (#F5F5F4) — this is the key change
- **Content padding**: 24px on mobile, 32px on desktop
- **Card gap**: 16-24px between cards
- **Max content width**: 1280px, centered on larger screens

### Spacing Scale
Use consistent spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.
The most common values: 8px (tight), 16px (standard), 24px (comfortable), 32px (section gaps).

---

## 4. Component Specifications

### Cards
Cards are the primary content container. They must visually float above the page background.

```css
/* Light */
.card { background: #FFFFFF; border: 1px solid #E7E5E4; border-radius: 12px; padding: 20px 24px; }
/* Dark */
.dark .card { background: #1C1917; border-color: #292524; }
```

Tailwind: `bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5`

**IMPORTANT RULES:**
- Cards should ALWAYS have a border. Without it, the surface doesn't separate from the background in either theme.
- Card padding should be generous (20-24px), not cramped.
- Card border-radius: 12px (rounded-xl). Not too round, not too sharp.
- Don't nest cards inside cards. If you need sections within a card, use dividers or subtle background changes.

### Stat Cards (Dashboard Metrics)
The top-row metric cards (Revenue, Labor, Parts, etc.) should follow this pattern:

```
┌─────────────────────────┐
│ REVENUE (THIS MONTH)    │  ← Label: uppercase, 11px, stone-400/dark:stone-500, tracking-wide
│ $12,450.00              │  ← Value: 28px, bold, stone-900/dark:stone-50
│ ↑ 12% vs last month     │  ← Trend: 12px, green-600/dark:green-400 or red-600/dark:red-400
└─────────────────────────┘
```

- The label should be clearly smaller and lighter than the value
- Big contrast between label and number creates visual hierarchy
- Optional: Add a subtle left border accent (4px, colored) to each stat card for visual punch
- Optional: Very subtle background tint matching the metric type (blue-50 for revenue, green-50 for profit, etc.)

### Buttons

**Primary Button:**
Tailwind: `bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors`

**Secondary Button:**
Tailwind: `bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold text-sm px-4 py-2.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 transition-colors`

**Danger Button:**
Tailwind: `bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-700 dark:text-red-400 font-semibold text-sm px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800 transition-colors`

**IMPORTANT:** The current Delete button is a solid bright red — this is too aggressive. Danger buttons should use the subtle pattern above. Solid red should ONLY appear in destructive confirmation modals.

**Button Sizes:**
- Small: `text-xs px-3 py-1.5 rounded-md` (for inline actions, table rows)
- Medium (default): `text-sm px-4 py-2.5 rounded-lg`
- Large: `text-base px-6 py-3 rounded-lg` (for primary page CTAs like "New Job")

### Status Badges
Badges should be pill-shaped with a subtle colored background, colored text, and NO hard borders.

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 9999px;          /* full pill */
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}
```

Examples (with dark mode):
- **Not Started**: `bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400`
- **In Progress**: `bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400`
- **Waiting for Parts**: `bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400`
- **Complete**: `bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400`
- **Paid**: `bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400`
- **Unpaid**: `bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400`
- **Draft**: `bg-stone-100 dark:bg-stone-800 text-stone-500`

Optional: Add a small colored dot (6px circle) before the text for extra visual cue.

### Sidebar Navigation
```
┌──────────────────────┐
│ ShopPilot            │  ← Brand: 18px, bold, stone-900
│ Serving Revere...    │  ← Tagline: 11px, stone-400
│                      │
│ ▪ Dashboard          │  ← Active: bg-blue-50, text-blue-700, font-semibold
│   Jobs               │  ← Inactive: text-stone-600, hover:bg-stone-50
│   Customers          │
│   Quick Pay          │
│   Inspections        │
│                      │
│ ─────────────────    │  ← Divider between sections
│   Reports            │
│   Settings           │
│                      │
│ ○ AI Assistant       │  ← Special treatment (maybe a subtle gradient or icon)
└──────────────────────┘
```

- Sidebar: `bg-white dark:bg-stone-900`, right border `border-stone-200 dark:border-stone-800`
- Active item: `bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 font-semibold` with a 3px left border accent in blue-600/blue-500
- Inactive item: `text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100`
- Items: 12-14px, padding 8px 16px, border-radius 6px (for the highlight)
- Icon + text alignment: icons should be 18-20px, in stone-400 (inactive) or blue-600 (active)
- Group related items and use a subtle divider (1px stone-100) between groups

### Tables & Lists
For list views (like Recent Jobs on the dashboard):

```
┌─────────────────────────────────────────────────────┐
│ RECENT JOBS                              View all → │
├─────────────────────────────────────────────────────┤
│ Anthony Falcucci          $827.00  Not Started  Unpaid │
│ (781) 775-3552 · Engine Oil Filter Housing          │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ Julian DiGregorio         $100.00  Not Started  Unpaid │
│ Brakes and oil · Jeep Cherokee                      │
└─────────────────────────────────────────────────────┘
```

- Row separator: 1px dashed or solid stone-100 (very subtle)
- Row padding: 14-16px vertical
- Row hover: bg-stone-50 with smooth transition
- Customer name: semibold, stone-900
- Secondary info (phone, vehicle): regular, stone-500, smaller text
- Amount: semibold, right-aligned
- Badges: right-aligned, inline

### Form Inputs

Tailwind: `bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/10 dark:focus:ring-blue-500/20 outline-none transition-colors`

Labels: `text-sm font-medium text-stone-700 dark:text-stone-300 mb-1.5`

### Dividers
- Between sections inside a card: `border-t border-stone-100 dark:border-stone-800` (very subtle)
- Between major page sections: Use spacing (32px gap) rather than lines
- Inside lists: `border-b border-stone-100 dark:border-stone-800` on each item except last

---

## 5. Page-Specific Guidelines

### Dashboard
The dashboard is the first thing you see. It should feel like a **command center** — quick scan, immediate understanding.

**Layout:**
```
[  + New Job (primary, full-width)  ] [ Quick Pay (secondary, full-width) ]

REVENUE
[ Today | This Week | This Month | Avg Ticket ]  ← 4 stat cards in a row

OPERATIONS
[ 1 unassigned job — alert bar ]
[ Shop Floor stats ] [ Tech Activity ]

RECENT JOBS
[ Job list rows ]
```

- The **alert bar** (unassigned jobs) should use `bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300`
- Stat cards should have subtle left-border accents or tinted backgrounds to differentiate them.
- "View all →" links: `text-blue-600 hover:text-blue-700 text-sm font-medium`

### Reports Page
Reports is data-heavy and needs the most visual structure.

**Stat cards at top:** Use the tinted background pattern:
- Revenue: left-border blue-500, or bg has a very subtle blue tint
- Labor: left-border emerald-500
- Parts: left-border amber-500
- Est. Gross Profit: left-border purple-500

**Charts area:** When charts exist, they go in white cards with proper padding and clear titles.

**Breakdown tables (Jobs by Category, Revenue by Tech, etc.):** Use the list/table pattern with proper row styling. When there's no data, show a centered empty state with a muted icon and "No data for this period" in stone-400.

### Job Detail Page
This is the most content-rich page. Structure it with clear sections:

```
[ Job Header: Title + Status dropdown + Edit/Delete ]
[ Customer Card: avatar circle + name + phone ]

LINE ITEMS
[ Service category groups with subtotals ]
[ Grand total — larger, bold, right-aligned ]

ESTIMATE
[ Status badge + dates + View Estimate link ]

PAYMENT
[ Amount + status + payment actions ]
```

- **"Add Service" button**: Should be primary style (blue)
- **"Add Item" button**: Should be secondary style (white with border)
- **Line item rows**: Give them a subtle bg-stone-50 background or left-border color coding by type (labor vs parts)
- **The grand total**: Should be visually prominent — larger text, maybe a top border to separate it from the items above
- **Category group headers** (like "Uncategorized"): Use the section heading style (uppercase, small, stone-400) with the subtotal right-aligned

---

## 6. Tailwind Configuration

If using Tailwind, extend the config to include the design tokens:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Use Tailwind's built-in stone and blue palettes — they match this system
      },
      borderRadius: {
        'card': '12px',
      },
      fontSize: {
        'metric-label': ['11px', { letterSpacing: '0.06em', fontWeight: '600' }],
        'section-heading': ['13px', { letterSpacing: '0.05em', fontWeight: '600' }],
      }
    }
  }
}
```

### Key Tailwind Classes to Use Consistently

**Page background:** `bg-stone-100 dark:bg-stone-950` (on the main content area, NOT the sidebar)

**Cards:** `bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5`

**Section headings:** `text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-3`

**Primary button:** `bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg`

**Secondary button:** `bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold text-sm px-4 py-2.5 rounded-lg border border-stone-200 dark:border-stone-700`

**Danger button:** `bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-700 dark:text-red-400 font-semibold text-sm px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800`

**Primary text:** `text-stone-900 dark:text-stone-50`

**Secondary text:** `text-stone-600 dark:text-stone-400`

**Tertiary text:** `text-stone-400 dark:text-stone-500`

**Dividers:** `border-stone-200 dark:border-stone-800` (card borders, major dividers) or `border-stone-100 dark:border-stone-800` (subtle list dividers)

**Sunken/inset backgrounds:** `bg-stone-50 dark:bg-stone-950` (line item rows, code blocks inside cards)

**Hover on surfaces:** `hover:bg-stone-50 dark:hover:bg-stone-800` (table rows, list items)

**Form inputs:** `bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:border-blue-600 dark:focus:border-blue-500 rounded-lg`

---

## 7. Anti-Patterns (Things to STOP Doing)

1. **White on white (light) or same-shade dark on dark.** Light mode: main content area MUST be stone-100, cards are white. Dark mode: main content area MUST be stone-950, cards are stone-900. This contrast creates depth in BOTH themes.

2. **Solid red delete buttons.** Use subtle red (red-50/red-950 bg, red-700/red-400 text) for danger actions. Solid red screams "ERROR" not "action."

3. **Everything the same size.** Metric values must be significantly larger than their labels. Page titles must be larger than section headings. Hierarchy = contrast.

4. **Cards without borders.** Every card needs a border (stone-200 light / stone-800 dark). No exceptions.

5. **Inconsistent border-radius.** Cards: 12px. Buttons: 8px. Badges: 9999px (full pill). Inputs: 8px. Don't mix.

6. **Too many font weights.** Stick to: 400 (body), 500 (labels), 600 (headings, buttons), 700 (page titles, big numbers). Nothing else.

7. **Using pure black (#000) or pure white (#FFF) for text.** Light mode: use stone-900 for darkest text. Dark mode: use stone-50 for lightest text. Pure extremes are too harsh.

8. **No hover states.** Every interactive element needs a hover state. Buttons darken, rows highlight, links underline.

9. **Forgetting dark: prefixes.** EVERY color class must have a corresponding `dark:` variant. If you write `bg-white`, you MUST also write `dark:bg-stone-900`. No exceptions. Missing dark classes = broken dark mode.

10. **Using opacity for dark mode backgrounds.** Don't use `bg-black/10` or similar opacity hacks. Use the specific dark mode color tokens from this system. Opacity-based backgrounds look muddy and inconsistent.

---

## 8. Implementation Priority

When refactoring the UI, do it in this order. **For every step, apply BOTH light and dark mode classes.**

1. **Set the page background.** `bg-stone-100 dark:bg-stone-950` on the main content area. This single change immediately creates depth in both themes.

2. **Add borders to all cards:** `bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl`.

3. **Fix the sidebar** — active state with blue-50/blue-950 background and left accent, proper spacing, dark mode borders.

4. **Standardize all buttons** — primary (blue), secondary (white/dark surface + border), danger (subtle red). All with `dark:` variants.

5. **Standardize all badges** — consistent pill shape, consistent color coding per status. Use `-50`/`-950` background pattern.

6. **Fix typography hierarchy** — section headings uppercase/small/light, values big/bold/dark. Text colors must flip for dark mode.

7. **Fix all form inputs** — background, border, placeholder, focus ring all need dark variants.

8. **Refine individual pages** — dashboard stats, reports charts, job detail layout.

---

## 9. Quick Reference: The 5 Rules

1. **Background layers create depth.** Light: stone-100 base, white cards. Dark: stone-950 base, stone-900 cards. NEVER same shade for both.
2. **Blue is for actions.** Buttons, links, active states. Blue-600 light, blue-500 dark.
3. **Status colors are soft.** Light tinted backgrounds (color-50), dark tinted backgrounds (color-950). Never solid colored badges.
4. **Typography has 3 levels.** Big/bold for values, medium for content, small/light for labels.
5. **Every component has BOTH themes.** If you write a light class without a `dark:` counterpart, it's broken. No exceptions.
