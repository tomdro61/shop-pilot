import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";

interface DashboardShellProps {
  greeting: string;
  statusLine?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}

// Search bar is intentionally non-functional for v1 — wired to a command palette in a later phase.
export function DashboardShell({
  greeting,
  statusLine,
  actions,
  children,
}: DashboardShellProps) {
  return (
    <PageShell>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-semibold text-stone-900 dark:text-stone-50 truncate">
            {greeting}
          </h1>
          {statusLine && (
            <div className="mt-0.5 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              {statusLine}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 text-stone-400 dark:text-stone-500 text-sm w-64"
            aria-hidden
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">Search RO, customer, plate…</span>
            <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-400">
              ⌘K
            </kbd>
          </div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </div>
      </div>
      {children}
    </PageShell>
  );
}
