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
  { value: "services", label: "Service Leads" },
  { value: "all", label: "All Reservations" },
];

export function ParkingTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "today";
  const currentLot = searchParams.get("lot") || "";

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
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParams({ tab: tab.value === "today" ? "" : tab.value })}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              currentTab === tab.value
                ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-50 shadow-sm"
                : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
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
        <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs">
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
