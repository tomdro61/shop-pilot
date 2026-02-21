"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const presets = [
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "this_quarter", label: "This Quarter" },
  { key: "this_year", label: "This Year" },
  { key: "all_time", label: "All Time" },
] as const;

export function ReportsToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = searchParams.get("range") || "this_month";

  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(
    undefined
  );
  const [popoverOpen, setPopoverOpen] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        }
      }
      router.push(`/reports?${params.toString()}`);
    },
    [router]
  );

  function handlePreset(key: string) {
    updateParams({ range: key });
  }

  function handleApplyCustom() {
    if (calendarRange?.from && calendarRange?.to) {
      updateParams({
        range: "custom",
        from: format(calendarRange.from, "yyyy-MM-dd"),
        to: format(calendarRange.to, "yyyy-MM-dd"),
      });
      setPopoverOpen(false);
    }
  }

  const isCustom = activeRange === "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Button
          key={p.key}
          variant={activeRange === p.key ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.key)}
        >
          {p.label}
        </Button>
      ))}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isCustom ? "default" : "outline"}
            size="sm"
            className={cn(!isCustom && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {isCustom && searchParams.get("from") && searchParams.get("to")
              ? `${searchParams.get("from")} – ${searchParams.get("to")}`
              : "Custom Range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <Calendar
              mode="range"
              selected={calendarRange}
              onSelect={setCalendarRange}
              numberOfMonths={2}
            />
            <div className="flex justify-end border-t pt-3">
              <Button
                size="sm"
                disabled={!calendarRange?.from || !calendarRange?.to}
                onClick={handleApplyCustom}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
