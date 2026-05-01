import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";

interface DashboardShellProps {
  greeting: string;
  statusLine?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}

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
        <div className="flex items-center gap-1.5">{actions}</div>
      </div>
      {children}
    </PageShell>
  );
}
