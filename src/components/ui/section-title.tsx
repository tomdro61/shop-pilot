import * as React from "react";

interface SectionTitleProps {
  /** Optional chapter-style numbered prefix. Omit on pages following the canonical (un-numbered) heading. */
  num?: string;
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionTitle({ num, title, sub, action, className = "" }: SectionTitleProps) {
  return (
    <div className={`flex items-center gap-3 px-1 mb-2.5 ${className}`}>
      {num && (
        <span className="font-mono tabular-nums text-[11px] font-semibold tracking-[0.08em] text-stone-400 dark:text-stone-600">
          {num}
        </span>
      )}
      <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50 tracking-tight">
        {title}
      </h2>
      {sub && <span className="text-xs text-stone-500 dark:text-stone-400">{sub}</span>}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
  );
}
