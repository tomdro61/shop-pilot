"use server";

import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/utils";
import { hasPendingService } from "@/lib/utils/parking";

const PARTS_AGED_THRESHOLD_DAYS = 3;

// ── Types ───────────────────────────────────────────────

interface CustomerJoin {
  id: string;
  first_name: string;
  last_name: string;
}
interface VehicleJoin {
  year: number | null;
  make: string | null;
  model: string | null;
}
interface JobJoin {
  id: string;
  title: string | null;
  ro_number: number | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
}

export interface InboxUnassignedJob {
  id: string;
  ro_number: number | null;
  title: string | null;
  status: string;
  date_received: string | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
}

export interface InboxAgedPart {
  id: string;
  ro_number: number | null;
  title: string | null;
  date_received: string | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
}

export interface InboxUnpaidJob {
  id: string;
  title: string | null;
  date_finished: string | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
  total: number;
}

export interface InboxDvi {
  id: string;
  completed_at: string | null;
  job_id: string | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
  jobs: JobJoin | null;
  monitor: number;
  attention: number;
}

export interface InboxEstimate {
  id: string;
  sent_at: string | null;
  jobs: JobJoin | null;
  total: number;
}

export interface InboxQuote {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  services: string[];
  message: string | null;
  created_at: string;
}

export interface InboxParkingLead {
  id: string;
  customer_id: string | null;
  first_name: string;
  last_name: string;
  make: string | null;
  model: string | null;
  color: string | null;
  lot: string;
  services_interested: string[];
  services_completed: string[] | null;
  drop_off_date: string;
  pick_up_date: string;
  status: string;
}

export interface InboxParkingSpecials {
  id: string;
  customer_id: string | null;
  first_name: string;
  last_name: string;
  make: string | null;
  model: string | null;
  lot: string;
  phone: string;
  drop_off_date: string;
  pick_up_date: string;
}

export interface InboxCounts {
  unassigned: number;
  unpaid: number;
  dvi: number;
  estimates: number;
  quotes: number;
  parkingLeads: number;
  parkingSpecials: number;
  parts: number;
  total: number;
}

export interface InboxData {
  unassignedJobs: InboxUnassignedJob[];
  unpaidJobs: InboxUnpaidJob[];
  dvisReady: InboxDvi[];
  pendingEstimates: InboxEstimate[];
  quoteRequests: InboxQuote[];
  parkingServiceLeads: InboxParkingLead[];
  parkingSpecialsNotSent: InboxParkingSpecials[];
  agedParts: InboxAgedPart[];
  counts: InboxCounts;
  today: string;
}

// ── Full data fetch for /inbox page ─────────────────────

export async function getInboxData(): Promise<InboxData> {
  const supabase = await createClient();
  const today = todayET();

  // Aged-parts cutoff — T12:00:00 anchor avoids DST-edge drift.
  const agedCutoff = new Date(today + "T12:00:00");
  agedCutoff.setDate(agedCutoff.getDate() - PARTS_AGED_THRESHOLD_DAYS);
  const agedCutoffDate = agedCutoff.toISOString().split("T")[0];

  const [
    unassignedResult,
    unpaidResult,
    dviResult,
    estimateResult,
    quoteResult,
    parkingLeadResult,
    parkingSpecialsResult,
    agedPartsResult,
  ] = await Promise.all([
    // Active jobs with no tech assigned
    supabase
      .from("jobs")
      .select("id, ro_number, title, status, date_received, customers(id, first_name, last_name), vehicles(year, make, model)")
      .in("status", ["not_started", "in_progress", "waiting_for_parts"])
      .is("assigned_tech", null)
      .order("date_received", { ascending: true }),
    // Unpaid completed jobs
    supabase
      .from("jobs")
      .select("id, title, date_finished, customers(id, first_name, last_name), vehicles(year, make, model), job_line_items(total)")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("date_finished", { ascending: true }),
    // DVIs completed but not sent (typed as string to avoid FK ambiguity with customers join)
    supabase
      .from("dvi_inspections")
      .select("id, completed_at, job_id, customers!dvi_inspections_customer_id_fkey(id, first_name, last_name), vehicles!dvi_inspections_vehicle_id_fkey(year, make, model), jobs(id, title, ro_number, customers(id, first_name, last_name), vehicles(year, make, model)), dvi_results(condition)" as string)
      .eq("status", "completed")
      .order("completed_at", { ascending: true }),
    // Estimates sent, awaiting approval
    supabase
      .from("estimates")
      .select("id, sent_at, jobs(id, title, ro_number, customers(id, first_name, last_name), vehicles(year, make, model)), estimate_line_items(total)")
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
    // New quote requests
    supabase
      .from("quote_requests")
      .select("id, first_name, last_name, phone, email, vehicle_year, vehicle_make, vehicle_model, services, message, created_at")
      .eq("status", "new")
      .order("created_at", { ascending: false }),
    // Parking service leads
    supabase
      .from("parking_reservations")
      .select("id, customer_id, first_name, last_name, make, model, color, lot, services_interested, services_completed, drop_off_date, pick_up_date, status")
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"])
      .order("drop_off_date", { ascending: true }),
    // Parking specials not sent — Broadway Motors only
    supabase
      .from("parking_reservations")
      .select("id, customer_id, first_name, last_name, make, model, lot, phone, drop_off_date, pick_up_date")
      .eq("status", "checked_in")
      .eq("lot", "Broadway Motors")
      .is("specials_sent_at", null)
      .order("drop_off_date", { ascending: true }),
    // Jobs in waiting_for_parts past threshold — date_received is a proxy
    // for time-in-status until status_changed_at is tracked.
    supabase
      .from("jobs")
      .select("id, ro_number, title, date_received, customers(id, first_name, last_name), vehicles(year, make, model)")
      .eq("status", "waiting_for_parts")
      .lte("date_received", agedCutoffDate)
      .order("date_received", { ascending: true }),
  ]);

  if (unassignedResult.error) throw new Error(`Failed to load unassigned jobs: ${unassignedResult.error.message}`);
  if (unpaidResult.error) throw new Error(`Failed to load unpaid jobs: ${unpaidResult.error.message}`);
  if (dviResult.error) throw new Error(`Failed to load DVI queue: ${dviResult.error.message}`);
  if (estimateResult.error) throw new Error(`Failed to load pending estimates: ${estimateResult.error.message}`);
  if (quoteResult.error) throw new Error(`Failed to load quote requests: ${quoteResult.error.message}`);
  if (parkingLeadResult.error) throw new Error(`Failed to load parking service leads: ${parkingLeadResult.error.message}`);
  if (parkingSpecialsResult.error) throw new Error(`Failed to load parking specials: ${parkingSpecialsResult.error.message}`);
  if (agedPartsResult.error) throw new Error(`Failed to load aged parts: ${agedPartsResult.error.message}`);

  // Process unpaid jobs — sum line item totals
  const unpaidJobs: InboxUnpaidJob[] = (unpaidResult.data || []).map((j) => ({
    id: j.id,
    title: j.title,
    date_finished: j.date_finished,
    customers: j.customers as CustomerJoin | null,
    vehicles: j.vehicles as VehicleJoin | null,
    total: ((j.job_line_items as { total: number }[]) || []).reduce((s, li) => s + (li.total || 0), 0),
  }));

  // Process DVIs — count conditions, strip raw results
  const dvisReady: InboxDvi[] = ((dviResult.data || []) as any[]).map((dvi: any) => {
    const results = (dvi.dvi_results ?? []) as { condition: string | null }[];
    const counts = { monitor: 0, attention: 0 };
    for (const r of results) {
      if (r.condition === "monitor") counts.monitor++;
      else if (r.condition === "attention") counts.attention++;
    }
    return {
      id: dvi.id,
      completed_at: dvi.completed_at,
      job_id: dvi.job_id,
      customers: dvi.customers as CustomerJoin | null,
      vehicles: dvi.vehicles as VehicleJoin | null,
      jobs: dvi.jobs as JobJoin | null,
      ...counts,
    };
  });

  // Process estimates — sum line item totals
  const pendingEstimates: InboxEstimate[] = (estimateResult.data || []).map((e) => ({
    id: e.id,
    sent_at: e.sent_at,
    jobs: e.jobs as JobJoin | null,
    total: ((e.estimate_line_items as { total: number }[]) || []).reduce((s, li) => s + (li.total || 0), 0),
  }));

  const quoteRequests = (quoteResult.data || []) as InboxQuote[];

  // Filter parking leads — exclude ones where all interested services are completed
  const parkingServiceLeads = ((parkingLeadResult.data || []) as InboxParkingLead[]).filter(
    hasPendingService
  );

  const parkingSpecialsNotSent = (parkingSpecialsResult.data || []) as InboxParkingSpecials[];

  const unassignedJobs = (unassignedResult.data || []).map((j) => ({
    id: j.id,
    ro_number: j.ro_number,
    title: j.title,
    status: j.status,
    date_received: j.date_received,
    customers: j.customers as CustomerJoin | null,
    vehicles: j.vehicles as VehicleJoin | null,
  })) as InboxUnassignedJob[];

  const agedParts = (agedPartsResult.data || []).map((j) => ({
    id: j.id,
    ro_number: j.ro_number,
    title: j.title,
    date_received: j.date_received,
    customers: j.customers as CustomerJoin | null,
    vehicles: j.vehicles as VehicleJoin | null,
  })) as InboxAgedPart[];

  const counts: InboxCounts = {
    unassigned: unassignedJobs.length,
    unpaid: unpaidJobs.length,
    dvi: dvisReady.length,
    estimates: pendingEstimates.length,
    quotes: quoteRequests.length,
    parkingLeads: parkingServiceLeads.length,
    parkingSpecials: parkingSpecialsNotSent.length,
    parts: agedParts.length,
    total:
      unassignedJobs.length +
      unpaidJobs.length +
      dvisReady.length +
      pendingEstimates.length +
      quoteRequests.length +
      parkingServiceLeads.length +
      parkingSpecialsNotSent.length +
      agedParts.length,
  };

  return {
    unassignedJobs,
    unpaidJobs,
    dvisReady,
    pendingEstimates,
    quoteRequests,
    parkingServiceLeads,
    parkingSpecialsNotSent,
    agedParts,
    counts,
    today,
  };
}

// ── Lightweight count for sidebar badge ─────────────────

export async function getInboxTotalCount(): Promise<number> {
  const supabase = await createClient();
  const today = todayET();
  const agedCutoff = new Date(today + "T12:00:00");
  agedCutoff.setDate(agedCutoff.getDate() - PARTS_AGED_THRESHOLD_DAYS);
  const agedCutoffDate = agedCutoff.toISOString().split("T")[0];

  const [unassigned, unpaid, dvi, estimates, quotes, leads, parts, specials] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["not_started", "in_progress", "waiting_for_parts"])
      .is("assigned_tech", null),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived"),
    supabase
      .from("dvi_inspections")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase
      .from("estimates")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent"),
    supabase
      .from("quote_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    // Fetch the rows (not just count) so we can apply the same "still has a
    // pending service" filter the inbox uses; otherwise the sidebar badge
    // overcounts by including reservations where every interested service
    // has already been completed.
    supabase
      .from("parking_reservations")
      .select("id, services_interested, services_completed")
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"]),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_for_parts")
      .lte("date_received", agedCutoffDate),
    supabase
      .from("parking_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_in")
      .eq("lot", "Broadway Motors")
      .is("specials_sent_at", null),
  ]);

  // Fail-soft: this drives the sidebar badge across all dashboard routes; throwing
  // would crash the entire dashboard layout. A wrong badge count is acceptable;
  // a broken layout is not. Log so failures are surfaced via console / future Sentry.
  const errors = [unassigned.error, unpaid.error, dvi.error, estimates.error, quotes.error, leads.error, parts.error, specials.error].filter(
    (e): e is NonNullable<typeof e> => e != null
  );
  if (errors.length > 0) {
    console.error(
      "[getInboxTotalCount] one or more count queries failed",
      errors.map((e) => e.message)
    );
  }

  const openLeadsCount = (leads.data ?? []).filter(hasPendingService).length;

  return (
    (unassigned.count || 0) +
    (unpaid.count || 0) +
    (dvi.count || 0) +
    (estimates.count || 0) +
    (quotes.count || 0) +
    openLeadsCount +
    (parts.count || 0) +
    (specials.count || 0)
  );
}
