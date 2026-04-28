"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PARKING_LOTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const tabs = [
  { value: "today", label: "Today" },
  { value: "calendar", label: "Calendar" },
  { value: "all", label: "All Reservations" },
  { value: "services", label: "Service Leads" },
];

export function ParkingTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "today";
  const currentLot = searchParams.get("lot") || "Broadway Motors";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/parking?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Tabs — bordered segmented control with high-contrast active state */}
      <div className="flex gap-0.5 rounded-md border border-stone-200 dark:border-stone-800 bg-card p-0.5 self-start">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParams({ tab: tab.value === "today" ? "" : tab.value })}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              currentTab === tab.value
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lot filter */}
      <Select
        value={currentLot || "all"}
        onValueChange={(value) => updateParams({ lot: value === "all" ? "" : value })}
      >
        <SelectTrigger
          size="sm"
          className="w-full sm:w-[220px] bg-card border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-none"
        >
          <SelectValue placeholder="All Lots" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Lots</SelectItem>
          {PARKING_LOTS.map((lot) => (
            <SelectItem key={lot} value={lot}>
              {lot}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
