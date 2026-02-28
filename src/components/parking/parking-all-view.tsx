"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
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
import { CheckInButton, CheckOutButton } from "@/components/parking/parking-actions";
import {
  PARKING_STATUS_ORDER,
  PARKING_STATUS_LABELS,
} from "@/lib/constants";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
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
      // Keep tab=all
      params.set("tab", "all");
      router.push(`/parking?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Debounced search — reset to page 1
  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get("search") || "";
      if (searchInput !== current) {
        updateParams({ search: searchInput, page: "" });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput, searchParams, updateParams]);

  const currentDropoff = searchParams.get("dropoff") || "";
  const currentPickup = searchParams.get("pickup") || "";

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
            value={currentDropoff}
            onChange={(e) => updateParams({ dropoff: e.target.value, page: "" })}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500 dark:text-stone-400 shrink-0">Pick-up</label>
          <Input
            type="date"
            className="w-full sm:w-[150px] h-9 text-xs"
            value={currentPickup}
            onChange={(e) => updateParams({ pickup: e.target.value, page: "" })}
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
      {reservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center">
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
              showActions={
                r.status === "reserved" ? (
                  <CheckInButton id={r.id} size="sm" />
                ) : r.status === "checked_in" ? (
                  <CheckOutButton id={r.id} size="sm" />
                ) : undefined
              }
            />
          ))}
        </div>
      )}

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
