"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { todayET } from "@/lib/utils";
import type { ParkingStatus } from "@/types";
import { findOrCreateParkingVehicle } from "@/lib/parking-vehicle";

// ── Fetch reservations with filters ─────────────────────────────

const PAGE_SIZE = 50;

export async function getParkingReservations(filters?: {
  search?: string;
  status?: ParkingStatus;
  lot?: string;
  dateFrom?: string;
  dateTo?: string;
  dropOffDate?: string;
  dropOffDates?: string[];
  pickUpDate?: string;
  pickUpDates?: string[];
  dateAny?: string;
  hasServices?: boolean;
  page?: number;
}) {
  const supabase = await createClient();
  const page = filters?.page || 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("parking_reservations")
    .select("*", { count: "exact" })
    .order("drop_off_date", { ascending: false })
    .order("drop_off_time", { ascending: false })
    .range(from, to);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.lot) {
    query = query.eq("lot", filters.lot);
  }
  if (filters?.dateFrom) {
    query = query.gte("drop_off_date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("drop_off_date", filters.dateTo);
  }
  if (filters?.dropOffDates && filters.dropOffDates.length > 0) {
    query = query.in("drop_off_date", filters.dropOffDates);
  } else if (filters?.dropOffDate) {
    query = query.eq("drop_off_date", filters.dropOffDate);
  }
  if (filters?.pickUpDates && filters.pickUpDates.length > 0) {
    query = query.in("pick_up_date", filters.pickUpDates);
  } else if (filters?.pickUpDate) {
    query = query.eq("pick_up_date", filters.pickUpDate);
  }
  if (filters?.dateAny) {
    query = query.or(
      `drop_off_date.eq.${filters.dateAny},pick_up_date.eq.${filters.dateAny}`
    );
  }
  if (filters?.hasServices) {
    query = query.not("services_interested", "eq", "{}");
  }
  if (filters?.search) {
    const s = filters.search.trim();
    const words = s.split(/\s+/);
    if (words.length > 1) {
      // "brian vecchio" → first_name LIKE %brian% AND last_name LIKE %vecchio%
      query = query
        .ilike("first_name", `%${words[0]}%`)
        .ilike("last_name", `%${words.slice(1).join(" ")}%`);
    } else {
      query = query.or(
        `first_name.ilike.%${s}%,last_name.ilike.%${s}%,license_plate.ilike.%${s}%,confirmation_number.ilike.%${s}%,phone.ilike.%${s}%,make.ilike.%${s}%,model.ilike.%${s}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

// ── Calendar counts ────────────────────────────────────────────

export type ParkingDayCounts = { dropOffs: number; pickUps: number };

export async function getParkingCalendarCounts({
  from,
  to,
  lot,
}: {
  from: string;
  to: string;
  lot?: string;
}): Promise<Record<string, ParkingDayCounts>> {
  const supabase = await createClient();

  let query = supabase
    .from("parking_reservations")
    .select("drop_off_date, pick_up_date, status, lot")
    .in("status", ["reserved", "checked_in", "checked_out"])
    // Reservation overlaps the visible window: drop ≤ to AND pick ≥ from
    .lte("drop_off_date", to)
    .gte("pick_up_date", from);

  if (lot) {
    query = query.eq("lot", lot);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const counts: Record<string, ParkingDayCounts> = {};
  for (const r of data ?? []) {
    if (r.drop_off_date >= from && r.drop_off_date <= to) {
      const day = (counts[r.drop_off_date] ??= { dropOffs: 0, pickUps: 0 });
      day.dropOffs += 1;
    }
    if (r.pick_up_date >= from && r.pick_up_date <= to) {
      const day = (counts[r.pick_up_date] ??= { dropOffs: 0, pickUps: 0 });
      day.pickUps += 1;
    }
  }

  return counts;
}

// ── Get single reservation ──────────────────────────────────────

export const getParkingReservation = cache(async (id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_reservations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
});

// ── Get today's dashboard data ──────────────────────────────────

export async function getParkingDashboard(lot?: string) {
  const supabase = await createClient();
  const today = todayET();

  function applyLotFilter<T extends { eq: (col: string, val: string) => T }>(
    q: T
  ): T {
    return lot ? q.eq("lot", lot) : q;
  }

  // Compute tomorrow from today's ET date string to avoid double timezone conversion
  const tomorrowDate = new Date(today + "T12:00:00");
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];

  const [arrivalsResult, pickupsResult, tomorrowPickupsResult, currentlyParkedResult, serviceLeadsResult] =
    await Promise.all([
      // Today's arrivals (reserved or checked_in, dropping off today)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("drop_off_date", today)
          .in("status", ["reserved", "checked_in"])
      ).order("drop_off_time", { ascending: true }),

      // Today's pickups (any active reservation picking up today)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("pick_up_date", today)
          .in("status", ["reserved", "checked_in", "checked_out"])
      ).order("pick_up_time", { ascending: true }),

      // Tomorrow's pickups (any active reservation picking up tomorrow)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("pick_up_date", tomorrow)
          .in("status", ["reserved", "checked_in", "checked_out"])
      ).order("pick_up_time", { ascending: true }),

      // Currently parked (all checked-in vehicles)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("status", "checked_in")
      ).order("pick_up_date", { ascending: true }),

      // Service leads (active reservations with services requested)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .not("services_interested", "eq", "{}")
          .in("status", ["reserved", "checked_in"])
      ).order("drop_off_date", { ascending: true }),
    ]);

  return {
    arrivals: arrivalsResult.data || [],
    pickups: pickupsResult.data || [],
    tomorrowPickups: tomorrowPickupsResult.data || [],
    currentlyParked: currentlyParkedResult.data || [],
    serviceLeads: serviceLeadsResult.data || [],
  };
}

// ── Check in ────────────────────────────────────────────────────

export async function checkInReservation(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_in" as const,
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Undo check in (back to reserved) ────────────────────────────

export async function undoCheckIn(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "reserved" as const,
      checked_in_at: null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Check out ───────────────────────────────────────────────────

export async function checkOutReservation(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_out" as const,
      checked_out_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Undo check out (back to checked in) ─────────────────────────

export async function undoCheckOut(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_in" as const,
      checked_out_at: null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Mark no-show ────────────────────────────────────────────────

export async function markNoShow(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({ status: "no_show" as const })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Cancel ──────────────────────────────────────────────────────

export async function cancelReservation(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({ status: "cancelled" as const })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

// ── Update notes / spot ─────────────────────────────────────────

export async function updateReservation(
  id: string,
  data: {
    staff_notes?: string | null;
    services_interested?: string[];
    services_completed?: string[];
    drop_off_date?: string;
    drop_off_time?: string;
    pick_up_date?: string;
    pick_up_time?: string;
    make?: string;
    model?: string;
    license_plate?: string;
    color?: string | null;
    arrival_valet?: string | null;
    departure_valet?: string | null;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update(data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  revalidatePath(`/parking/${id}`);
  return { success: true };
}

export async function deleteReservation(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  return { success: true };
}

// ── Prepare new job from reservation (find or create vehicle) ──

export async function prepareJobFromReservation(reservationId: string): Promise<{ url: string } | { error: string }> {
  const supabase = createAdminClient();

  const { data: res, error } = await supabase
    .from("parking_reservations")
    .select("customer_id, make, model, license_plate, color")
    .eq("id", reservationId)
    .single();

  if (error || !res) return { error: "Reservation not found" };
  if (!res.customer_id) return { error: "No customer linked to this reservation" };

  const customerId = res.customer_id;
  let vehicleId: string | null = null;

  if (res.make && res.model) {
    vehicleId = await findOrCreateParkingVehicle({
      customerId,
      make: res.make,
      model: res.model,
      color: res.color,
      licensePlate: res.license_plate,
    });
  }

  const params = new URLSearchParams({ customerId });
  if (vehicleId) params.set("vehicleId", vehicleId);
  return { url: `/jobs/new?${params.toString()}` };
}
