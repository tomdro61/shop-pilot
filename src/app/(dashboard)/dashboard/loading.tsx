function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-stone-200/70 dark:bg-stone-800/70 rounded animate-pulse ${className}`}
    />
  );
}

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4 lg:py-5 space-y-4">
      {/* Header strip */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Bar className="h-5 w-44" />
          <Bar className="mt-2 h-3.5 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Bar className="hidden md:block h-9 w-64" />
          <Bar className="h-8 w-28" />
          <Bar className="h-8 w-24" />
          <Bar className="h-8 w-24" />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardShell key={i} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bar className="h-8 w-8" />
                <Bar className="h-3 w-24" />
              </div>
              <Bar className="h-5 w-12 rounded-full" />
            </div>
            <Bar className="mt-3 h-7 w-32" />
            <Bar className="mt-2 h-3 w-28" />
          </CardShell>
        ))}
      </div>

      {/* Compact metrics row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardShell key={i}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <Bar className="h-7 w-7" />
              <Bar className="h-3 w-32" />
            </div>
            <div className="grid grid-cols-3 divide-x divide-stone-100 dark:divide-stone-800">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="px-3 py-2.5 space-y-1">
                  <Bar className="h-2.5 w-12" />
                  <Bar className="h-4 w-10" />
                  <Bar className="h-2.5 w-14" />
                </div>
              ))}
            </div>
          </CardShell>
        ))}
      </div>

      {/* Sub-header strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <CardShell key={i} className="p-4 flex items-center gap-3">
            <Bar className="h-10 w-10" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3.5 w-32" />
              <Bar className="h-3 w-44" />
            </div>
            <Bar className="h-4 w-4 rounded-full" />
          </CardShell>
        ))}
      </div>

      {/* Open Loops */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bar className="h-6 w-6" />
            <Bar className="h-3.5 w-24" />
            <Bar className="h-4 w-8 rounded-full" />
          </div>
        </div>
        <CardShell>
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-stone-100 dark:border-stone-800">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 h-14 border-b border-stone-200 dark:border-stone-800 last:border-b-0"
              >
                <Bar className="h-6 w-24 rounded-full" />
                <Bar className="h-7 w-7 rounded-md" />
                <Bar className="h-4 flex-1 max-w-[420px]" />
                <Bar className="h-5 w-24 rounded-full" />
                <Bar className="h-3 w-12" />
                <Bar className="h-3 w-12" />
                <Bar className="h-7 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </CardShell>
      </div>

      {/* Shop Floor */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bar className="h-6 w-6" />
            <Bar className="h-3.5 w-24" />
            <Bar className="h-4 w-8 rounded-full" />
          </div>
          <Bar className="h-3 w-16" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, col) => (
            <div
              key={col}
              className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 overflow-hidden flex flex-col"
            >
              <div aria-hidden className="h-[3px] w-full bg-stone-200/70 dark:bg-stone-800/70" />
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
                <div className="flex items-center gap-2">
                  <Bar className="h-6 w-6" />
                  <Bar className="h-3.5 w-28" />
                  <Bar className="h-4 w-6 rounded-full" />
                </div>
                <Bar className="h-3 w-14" />
              </div>
              <div className="flex-1 p-2 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="flex items-start gap-2 px-3 py-2.5 bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card"
                  >
                    <div className="flex-1 space-y-1">
                      <Bar className="h-3.5 w-28" />
                      <Bar className="h-3 w-32" />
                      <Bar className="h-3 w-20" />
                    </div>
                    <Bar className="h-4 w-8 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
