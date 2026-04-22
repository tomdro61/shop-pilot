"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ParkingReservationCard } from "@/components/parking/parking-reservation-card";
import { ParkingCardActions } from "@/components/parking/parking-card-actions";
import {
  PARKING_STATUS_ORDER,
  PARKING_STATUS_LABELS,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ParkingReservation } from "@/types";

export function ParkingAllView({
  reservations,
  page,
  totalPages,
  total,
}: {
  reservations: ParkingReservation[];
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || ""
  );

  const currentStatus = searchParams.get("status") || "";

  const [isPending, startTransition] = useTransition();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      // Keep tab=all
      params.set("tab", "all");
      startTransition(() => {
        router.push(`/parking?${params.toString()}`);
      });
    },
    [router]
  );

  // Debounced search — reset to page 1
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParamsRef.current.get("search") || "";
      if (searchInput !== current) {
        updateParams({ search: searchInput, page: "" });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, updateParams]);

  const currentDropoffs = searchParams.get("dropoff")?.split(",").filter(Boolean) || [];
  const currentPickups = searchParams.get("pickup")?.split(",").filter(Boolean) || [];

  function addDate(key: "dropoff" | "pickup", date: string) {
    const current = key === "dropoff" ? currentDropoffs : currentPickups;
    if (!date || current.includes(date)) return;
    const updated = [...current, date].sort();
    updateParams({ [key]: updated.join(","), page: "" });
  }

  function removeDate(key: "dropoff" | "pickup", date: string) {
    const current = key === "dropoff" ? currentDropoffs : currentPickups;
    const updated = current.filter((d) => d !== date);
    updateParams({ [key]: updated.join(","), page: "" });
  }

  function formatShortDate(date: string) {
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Search name, plate, phone, confirmation #..."
            className="pl-9 h-9 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-stone-400 shrink-0">Drop-off</label>
          <Input
            type="date"
            className="w-full sm:w-[150px] h-9 text-xs"
            value=""
            onChange={(e) => { addDate("dropoff", e.target.value); e.target.value = ""; }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-stone-400 shrink-0">Pick-up</label>
          <Input
            type="date"
            className="w-full sm:w-[150px] h-9 text-xs"
            value=""
            onChange={(e) => { addDate("pickup", e.target.value); e.target.value = ""; }}
          />
        </div>
        <Select
          value={currentStatus || "all"}
          onValueChange={(value) =>
            updateParams({ status: value === "all" ? "" : value, page: "" })
          }
        >
          <SelectTrigger className="w-full sm:w-[160px] h-9 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PARKING_STATUS_ORDER.map((status) => (
              <SelectItem key={status} value={status}>
                {PARKING_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selected date badges */}
      {(currentDropoffs.length > 0 || currentPickups.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {currentDropoffs.map((date) => (
            <Badge
              key={`dropoff-${date}`}
              variant="secondary"
              className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-0 text-xs gap-1 pr-1"
            >
              Drop-off: {formatShortDate(date)}
              <button
                type="button"
                onClick={() => removeDate("dropoff", date)}
                className="ml-0.5 rounded-md p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {currentPickups.map((date) => (
            <Badge
              key={`pickup-${date}`}
              variant="secondary"
              className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-0 text-xs gap-1 pr-1"
            >
              Pick-up: {formatShortDate(date)}
              <button
                type="button"
                onClick={() => removeDate("pickup", date)}
                className="ml-0.5 rounded-md p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Results count + pagination info */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {total} reservation{total !== 1 ? "s" : ""}
          {totalPages > 1 && (
            <span> · Page {page} of {totalPages}</span>
          )}
        </p>
      </div>

      {/* List */}
      <div className={isPending ? "opacity-50 transition-opacity duration-150" : ""}>
      {reservations.length === 0 ? (
        <div className="bg-card rounded-lg shadow-card p-8 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No reservations found.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => (
            <ParkingReservationCard
              key={r.id}
              reservation={r}
              showActions={<ParkingCardActions reservation={r} />}
            />
          ))}
        </div>
      )}

      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <span className="text-xs text-stone-500 dark:text-stone-400 px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
