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
    <div className="flex gap-1">
      {CUSTOMER_TYPES.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-bold transition-colors",
            value === t.value
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
