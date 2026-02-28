"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { todayET, formatDateET } from "@/lib/utils";
import type { ParkingStatus } from "@/types";

// ── Fetch reservations with filters ─────────────────────────────

const PAGE_SIZE = 50;

export async function getParkingReservations(filters?: {
  search?: string;
  status?: ParkingStatus;
  lot?: string;
  dateFrom?: string;
  dateTo?: string;
  dropOffDate?: string;
  pickUpDate?: string;
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
  if (filters?.dropOffDate) {
    query = query.eq("drop_off_date", filters.dropOffDate);
  }
  if (filters?.pickUpDate) {
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
    const s = filters.search;
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,license_plate.ilike.%${s}%,confirmation_number.ilike.%${s}%,phone.ilike.%${s}%`
    );
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

  const tomorrowDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDateET(tomorrowDate);

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

      // Today's pickups (checked in or checked out, picking up today)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("pick_up_date", today)
          .in("status", ["checked_in", "checked_out"])
      ).order("pick_up_time", { ascending: true }),

      // Tomorrow's pickups (checked in, picking up tomorrow)
      applyLotFilter(
        supabase
          .from("parking_reservations")
          .select("*")
          .eq("pick_up_date", tomorrow)
          .eq("status", "checked_in")
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
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_in" as const,
      checked_in_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  return { success: true };
}

// ── Check out ───────────────────────────────────────────────────

export async function checkOutReservation(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({
      status: "checked_out" as const,
      checked_out_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  return { success: true };
}

// ── Mark no-show ────────────────────────────────────────────────

export async function markNoShow(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({ status: "no_show" as const })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  return { success: true };
}

// ── Cancel ──────────────────────────────────────────────────────

export async function cancelReservation(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("parking_reservations")
    .update({ status: "cancelled" as const })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/parking");
  return { success: true };
}

// ── Update notes / spot ─────────────────────────────────────────

export async function updateReservation(
  id: string,
  data: { staff_notes?: string | null; services_interested?: string[] }
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
