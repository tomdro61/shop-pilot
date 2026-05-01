"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { todayET } from "@/lib/utils";
import { hasPendingService } from "@/lib/utils/parking";

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

export interface InboxUnpaidJob {
  id: string;
  title: string | null;
  date_finished: string | null;
  customers: CustomerJoin | null;
  vehicles: VehicleJoin | null;
  total: number;
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
  estimates: number;
  quotes: number;
  parkingLeads: number;
  parkingSpecials: number;
  total: number;
}

export interface InboxData {
  unassignedJobs: InboxUnassignedJob[];
  unpaidJobs: InboxUnpaidJob[];
  pendingEstimates: InboxEstimate[];
  quoteRequests: InboxQuote[];
  parkingServiceLeads: InboxParkingLead[];
  parkingSpecialsNotSent: InboxParkingSpecials[];
  counts: InboxCounts;
  today: string;
}

// ── Full data fetch for /inbox page ─────────────────────

export async function getInboxData(): Promise<InboxData> {
  const auth = await requireManager();
  if (!auth.ok) throw new Error(auth.error);

  const supabase = await createClient();
  const today = todayET();

  const [
    unassignedResult,
    unpaidResult,
    estimateResult,
    quoteResult,
    parkingLeadResult,
    parkingSpecialsResult,
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
  ]);

  if (unassignedResult.error) throw new Error(`Failed to load unassigned jobs: ${unassignedResult.error.message}`);
  if (unpaidResult.error) throw new Error(`Failed to load unpaid jobs: ${unpaidResult.error.message}`);
  if (estimateResult.error) throw new Error(`Failed to load pending estimates: ${estimateResult.error.message}`);
  if (quoteResult.error) throw new Error(`Failed to load quote requests: ${quoteResult.error.message}`);
  if (parkingLeadResult.error) throw new Error(`Failed to load parking service leads: ${parkingLeadResult.error.message}`);
  if (parkingSpecialsResult.error) throw new Error(`Failed to load parking specials: ${parkingSpecialsResult.error.message}`);

  // Process unpaid jobs — sum line item totals
  const unpaidJobs: InboxUnpaidJob[] = (unpaidResult.data || []).map((j) => ({
    id: j.id,
    title: j.title,
    date_finished: j.date_finished,
    customers: j.customers as CustomerJoin | null,
    vehicles: j.vehicles as VehicleJoin | null,
    total: ((j.job_line_items as { total: number }[]) || []).reduce((s, li) => s + (li.total || 0), 0),
  }));

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

  const counts: InboxCounts = {
    unassigned: unassignedJobs.length,
    unpaid: unpaidJobs.length,
    estimates: pendingEstimates.length,
    quotes: quoteRequests.length,
    parkingLeads: parkingServiceLeads.length,
    parkingSpecials: parkingSpecialsNotSent.length,
    total:
      unassignedJobs.length +
      unpaidJobs.length +
      pendingEstimates.length +
      quoteRequests.length +
      parkingServiceLeads.length +
      parkingSpecialsNotSent.length,
  };

  return {
    unassignedJobs,
    unpaidJobs,
    pendingEstimates,
    quoteRequests,
    parkingServiceLeads,
    parkingSpecialsNotSent,
    counts,
    today,
  };
}

// ── Lightweight count for sidebar badge ─────────────────

export async function getInboxTotalCount(): Promise<number> {
  // Auth-failure returns 0 to match the existing fail-soft pattern below —
  // a wrong-but-zero badge beats a thrown exception that crashes the
  // dashboard layout (this runs on every dashboard route render).
  const auth = await requireManager();
  if (!auth.ok) return 0;

  const supabase = await createClient();

  const [unassigned, unpaid, estimates, quotes, leads, specials] = await Promise.all([
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
      .from("parking_reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "checked_in")
      .eq("lot", "Broadway Motors")
      .is("specials_sent_at", null),
  ]);

  // Fail-soft: this drives the sidebar badge across all dashboard routes; throwing
  // would crash the entire dashboard layout. A wrong badge count is acceptable;
  // a broken layout is not. Log so failures are surfaced via console / future Sentry.
  const errors = [unassigned.error, unpaid.error, estimates.error, quotes.error, leads.error, specials.error].filter(
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
    (estimates.count || 0) +
    (quotes.count || 0) +
    openLeadsCount +
    (specials.count || 0)
  );
}
