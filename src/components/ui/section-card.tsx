import * as React from "react";

/**
 * Small uppercase label class — used for card section headers, table column headers,
 * and secondary labels inside card bodies (Phone/Email/Address spec-sheet pattern).
 */
export const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";

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
 * The header uses the same visual treatment as table column headers (bg-stone-50 + small uppercase label).
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <div className={`bg-card border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-stone-50 dark:bg-stone-900/40 border-b border-stone-200 dark:border-stone-800">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-1.5 ${SECTION_LABEL}`}>
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
