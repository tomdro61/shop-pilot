"use client";

import { cn } from "@/lib/utils";
import { Check, AlertTriangle, AlertCircle } from "lucide-react";
import type { DviCondition } from "@/types";

const CONDITIONS: {
  value: DviCondition;
  label: string;
  icon: typeof Check;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    value: "good",
    label: "Good",
    icon: Check,
    activeClass: "bg-green-500 text-white ring-green-500",
    inactiveClass: "text-green-600 ring-stone-200 dark:ring-stone-700 hover:bg-green-50 dark:hover:bg-green-950",
  },
  {
    value: "monitor",
    label: "Monitor",
    icon: AlertTriangle,
    activeClass: "bg-amber-500 text-white ring-amber-500",
    inactiveClass: "text-amber-600 ring-stone-200 dark:ring-stone-700 hover:bg-amber-50 dark:hover:bg-amber-950",
  },
  {
    value: "attention",
    label: "Attention",
    icon: AlertCircle,
    activeClass: "bg-red-500 text-white ring-red-500",
    inactiveClass: "text-red-600 ring-stone-200 dark:ring-stone-700 hover:bg-red-50 dark:hover:bg-red-950",
  },
];

interface ConditionButtonsProps {
  value: DviCondition | null;
  onChange: (condition: DviCondition) => void;
  disabled?: boolean;
}

export function ConditionButtons({ value, onChange, disabled }: ConditionButtonsProps) {
  return (
    <div className="flex gap-2">
      {CONDITIONS.map((c) => {
        const isActive = value === c.value;
        const Icon = c.icon;
        return (
          <button
            key={c.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(c.value)}
            aria-label={c.label}
            aria-pressed={isActive}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full ring-2 transition-all active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isActive ? c.activeClass : c.inactiveClass
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={isActive ? 3 : 2} />
          </button>
        );
      })}
    </div>
  );
}
