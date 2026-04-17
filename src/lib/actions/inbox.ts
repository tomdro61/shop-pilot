"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayET } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────

interface CustomerJoin {
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
  unpaid: number;
  dvi: number;
  estimates: number;
  quotes: number;
  parkingLeads: number;
  parkingSpecials: number;
  total: number;
}

export interface InboxData {
  unpaidJobs: InboxUnpaidJob[];
  dvisReady: InboxDvi[];
  pendingEstimates: InboxEstimate[];
  quoteRequests: InboxQuote[];
  parkingServiceLeads: InboxParkingLead[];
  parkingSpecialsNotSent: InboxParkingSpecials[];
  counts: InboxCounts;
  today: string;
}

// ── Full data fetch for /inbox page ─────────────────────

export async function getInboxData(): Promise<InboxData> {
  const supabase = createAdminClient();
  const today = todayET();

  const [
    unpaidResult,
    dviResult,
    estimateResult,
    quoteResult,
    parkingLeadResult,
    parkingSpecialsResult,
  ] = await Promise.all([
    // Unpaid completed jobs
    supabase
      .from("jobs")
      .select("id, title, date_finished, customers(first_name, last_name), vehicles(year, make, model), job_line_items(total)")
      .eq("status", "complete")
      .neq("payment_status", "paid")
      .neq("payment_status", "waived")
      .order("date_finished", { ascending: true }),
    // DVIs completed but not sent (typed as string to avoid FK ambiguity with customers join)
    supabase
      .from("dvi_inspections")
      .select("id, completed_at, job_id, customers!dvi_inspections_customer_id_fkey(first_name, last_name), vehicles!dvi_inspections_vehicle_id_fkey(year, make, model), jobs(id, title, ro_number, customers(first_name, last_name), vehicles(year, make, model)), dvi_results(condition)" as string)
      .eq("status", "completed")
      .order("completed_at", { ascending: true }),
    // Estimates sent, awaiting approval
    supabase
      .from("estimates")
      .select("id, sent_at, jobs(id, title, ro_number, customers(first_name, last_name), vehicles(year, make, model)), estimate_line_items(total)")
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
      .select("id, first_name, last_name, make, model, color, lot, services_interested, services_completed, drop_off_date, pick_up_date, status")
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"])
      .order("drop_off_date", { ascending: true }),
    // Parking specials not sent — Broadway Motors only
    supabase
      .from("parking_reservations")
      .select("id, first_name, last_name, make, model, lot, phone, drop_off_date, pick_up_date")
      .eq("status", "checked_in")
      .eq("lot", "Broadway Motors")
      .is("specials_sent_at", null)
      .order("drop_off_date", { ascending: true }),
  ]);

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
  const parkingServiceLeads = ((parkingLeadResult.data || []) as InboxParkingLead[]).filter((r) => {
    const completed = new Set(r.services_completed || []);
    return r.services_interested.some((s) => !completed.has(s));
  });

  const parkingSpecialsNotSent = (parkingSpecialsResult.data || []) as InboxParkingSpecials[];

  const counts: InboxCounts = {
    unpaid: unpaidJobs.length,
    dvi: dvisReady.length,
    estimates: pendingEstimates.length,
    quotes: quoteRequests.length,
    parkingLeads: parkingServiceLeads.length,
    parkingSpecials: parkingSpecialsNotSent.length,
    total: unpaidJobs.length + dvisReady.length + pendingEstimates.length + quoteRequests.length + parkingServiceLeads.length + parkingSpecialsNotSent.length,
  };

  return {
    unpaidJobs,
    dvisReady,
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
  const supabase = createAdminClient();

  const [unpaid, dvi, estimates, quotes, leads] = await Promise.all([
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
    supabase
      .from("parking_reservations")
      .select("id", { count: "exact", head: true })
      .not("services_interested", "eq", "{}")
      .in("status", ["reserved", "checked_in"]),
  ]);

  return (unpaid.count || 0) + (dvi.count || 0) + (estimates.count || 0) + (quotes.count || 0) + (leads.count || 0);
}
