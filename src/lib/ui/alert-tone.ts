/**
 * Tone vocabulary for the dashboard's alert/needs-attention surfaces.
 * Co-locates every class string a tone produces so the action center,
 * inbox filter chips, and any future consumer cannot drift on light/dark
 * variants of the same color.
 *
 * Distinct from `Accent` in `components/ui/mini-status-card.tsx` — that one
 * predates this and serves the section-header / KPI / mini-status family.
 * The two should converge eventually; until then, prefer `Tone` for
 * net-new alert-flavored UI.
 */
export type Tone = "amber" | "blue" | "indigo" | "violet" | "emerald" | "red";

interface ToneClasses {
  /** Bordered 7–9px icon tile — alert cards, section headers. */
  tile: string;
  /** 3px left accent strip on alert cards. */
  bar: string;
  /** Alert-card body — soft tint background + border + hover. */
  card: string;
  /** Heavier text color for the alert card's count number. */
  count: string;
  /** Filter chip in its active state — background + border + text. */
  chip: string;
}

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  amber: {
    tile:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
    bar: "bg-amber-500",
    card:
      "bg-amber-50/60 border-amber-200 hover:bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 dark:hover:bg-amber-950/40",
    count: "text-amber-900 dark:text-amber-200",
    chip:
      "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200",
  },
  blue: {
    tile:
      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
    bar: "bg-blue-500",
    card:
      "bg-blue-50/60 border-blue-200 hover:bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 dark:hover:bg-blue-950/40",
    count: "text-blue-900 dark:text-blue-200",
    chip:
      "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200",
  },
  indigo: {
    tile:
      "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
    bar: "bg-indigo-500",
    card:
      "bg-indigo-50/60 border-indigo-200 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-900 dark:hover:bg-indigo-950/40",
    count: "text-indigo-900 dark:text-indigo-200",
    chip:
      "bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-200",
  },
  violet: {
    tile:
      "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
    bar: "bg-violet-500",
    card:
      "bg-violet-50/60 border-violet-200 hover:bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 dark:hover:bg-violet-950/40",
    count: "text-violet-900 dark:text-violet-200",
    chip:
      "bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/40 dark:border-violet-900 dark:text-violet-200",
  },
  emerald: {
    tile:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
    bar: "bg-emerald-500",
    card:
      "bg-emerald-50/60 border-emerald-200 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 dark:hover:bg-emerald-950/40",
    count: "text-emerald-900 dark:text-emerald-200",
    chip:
      "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200",
  },
  red: {
    tile:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
    bar: "bg-red-500",
    card:
      "bg-red-50/60 border-red-200 hover:bg-red-50 dark:bg-red-950/20 dark:border-red-900 dark:hover:bg-red-950/40",
    count: "text-red-900 dark:text-red-200",
    chip:
      "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200",
  },
};
