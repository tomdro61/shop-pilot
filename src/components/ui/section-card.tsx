import * as React from "react";

/**
 * Small uppercase label class — used for secondary labels inside card bodies
 * (Phone/Email/Address spec-sheet pattern) and any label where the bg is already
 * tinted or the label role is supporting.
 */
export const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300";

/**
 * Heavier variant for column/section HEADER rows. Headers sit on the
 * navy sidebar color (bg-sidebar) -- this class is paired with that
 * dark strip, so the text is light.
 */
export const COLUMN_HEADER =
  "text-[11px] font-bold uppercase tracking-wider text-white";

interface SectionCardProps {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Flat-light-card container with a tinted header bar.
 * Use anywhere you need a labeled section — list containers, form sections, status panels.
 * The header uses the same visual treatment as table column headers (bg-stone-100 + small uppercase label).
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <div className={`bg-card border border-stone-200 dark:border-stone-800 rounded-lg shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-sidebar border-b border-stone-200 dark:border-stone-800">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-1.5 ${COLUMN_HEADER}`}>
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
