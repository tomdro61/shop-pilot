"use client";

import { cn } from "@/lib/utils";

const CUSTOMER_TYPES = [
  { value: "all", label: "All" },
  { value: "retail", label: "Retail" },
  { value: "parking", label: "Parking" },
  { value: "fleet", label: "Fleet" },
] as const;

export function CustomerTypePills({
  value,
  onChange,
}: {
  value: string;
  onChange: (type: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-md border border-stone-200 dark:border-stone-800 bg-card p-1 self-start">
      {CUSTOMER_TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          aria-pressed={value === t.value}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            value === t.value
              ? "bg-stone-100 text-stone-900 shadow-card dark:bg-stone-800 dark:text-stone-50"
              : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
