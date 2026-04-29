"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-8">
      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-10 h-10 rounded-md grid place-items-center border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
            <AlertCircle className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-50">
            Couldn&rsquo;t load the dashboard
          </h2>
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-300">{error.message}</p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-stone-400 dark:text-stone-500">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
