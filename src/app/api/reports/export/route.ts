import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { resolveDateRange } from "@/lib/utils/date-range";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { assertComplete } from "@/lib/supabase/assert-complete";
import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
  INSPECTION_COST_STATE,
} from "@/lib/constants";

type ExportLineItem = {
  type: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total: number | null;
  cost: number | null;
  part_number: string | null;
  category: string | null;
};
type ExportJobRow = {
  id: string;
  ro_number: number | null;
  status: string;
  date_received: string | null;
  date_finished: string | null;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
  notes: string | null;
  assigned_tech: string | null;
  users: { name: string } | null;
  customers: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    customer_type: string | null;
    fleet_account: string | null;
  } | null;
  vehicles: {
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    license_plate: string | null;
  } | null;
  job_line_items: ExportLineItem[] | null;
};

function escapeCSV(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSVRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => {
      if (f == null || f === "") return "";
      return escapeCSV(String(f));
    })
    .join(",");
}

export async function GET(req: NextRequest) {
  // Manager-only: this CSV carries wholesale cost and per-line profit plus
  // customer phone and email. It previously checked only that SOME user was
  // signed in, so any tech could export both.
  const auth = await requireManager();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "Unauthorized" ? 401 : 403 });
  }

  const supabase = await createClient();

  const { searchParams } = req.nextUrl;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const resolved = resolveDateRange(range, from, to);

  // Both reads below used to discard `error` and fall back to `[]`, so any
  // failure produced a well-formed CSV reading GRAND TOTAL REVENUE: 0.00 —
  // which opens in Excel and looks authoritative. They are also the reason the
  // "All Time" preset (2000-01-01) silently truncated at 1000 jobs.
  //
  // `.order("date_finished")` alone is NOT a stable sort — many jobs share a
  // completion date — so paging on it would duplicate and drop rows. The `id`
  // tiebreaker is what makes the paging deterministic; keep both.
  let jobs: ExportJobRow[];
  let dailyCounts: { date: string; state_count: number; tnc_count: number }[];
  try {
    [jobs, dailyCounts] = await Promise.all([
      fetchAllRows<ExportJobRow>(
        (pageFrom, pageTo) =>
          supabase
            .from("jobs")
            .select(
              `id, ro_number, status, date_received, date_finished, payment_status, payment_method, paid_at, notes,
               assigned_tech, users!jobs_assigned_tech_fkey(name),
               customers(first_name, last_name, phone, email, customer_type, fleet_account),
               vehicles(year, make, model, vin, license_plate),
               job_line_items(type, description, quantity, unit_cost, total, cost, part_number, category)`,
              { count: "exact" }
            )
            .eq("status", "complete")
            .gte("date_finished", resolved.from)
            .lte("date_finished", resolved.to)
            .order("date_finished", { ascending: true })
            .order("id", { ascending: true })
            .range(pageFrom, pageTo)
            .returns<ExportJobRow[]>(),
        "jobs for revenue export"
      ),
      supabase
        .from("daily_inspection_counts")
        .select("date, state_count, tnc_count", { count: "exact" })
        .gte("date", resolved.from)
        .lte("date", resolved.to)
        .order("date", { ascending: true })
        .then((r) => assertComplete(r, "inspection counts for export")),
    ]);
  } catch (err) {
    console.error("[reports-export] data fetch failed", {
      userId: auth.userId,
      range,
      from: resolved.from,
      to: resolved.to,
      error: err instanceof Error ? err.message : err,
    });
    // Deliberately NOT a CSV response and no Content-Disposition — a browser
    // must never save a failure as a .csv the operator then files.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build export" },
      { status: 500 }
    );
  }

  // Build CSV — one row per line item
  const jobHeaders = [
    "RO #",
    "Job ID",
    "Date Completed",
    "Date Received",
    "Customer Name",
    "Customer Phone",
    "Customer Email",
    "Customer Type",
    "Fleet Account",
    "Vehicle",
    "VIN",
    "License Plate",
    "Assigned Tech",
    "Category",
    "Line Item Type",
    "Description",
    "Qty",
    "Unit Price",
    "Total",
    "Cost (Wholesale)",
    "Profit",
    "Part Number",
    "Payment Status",
    "Payment Method",
    "Payment Date",
    "Job Notes",
  ];

  const rows: string[] = [toCSVRow(jobHeaders)];
  let grandTotal = 0;

  jobs.forEach((job) => {
    // No casts — the row is typed by ExportJobRow above. The casts that used to
    // sit here re-declared `total` as non-null, which is false at the DB layer
    // and is exactly how a shape mismatch stays invisible.
    const customer = job.customers;
    const vehicle = job.vehicles;
    const tech = job.users;
    const lineItems = job.job_line_items ?? [];

    const roStr = job.ro_number ? `RO-${String(job.ro_number).padStart(4, "0")}` : "";
    const customerName = customer
      ? `${customer.first_name} ${customer.last_name}`
      : "";
    const vehicleStr = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
      : "";

    // Filter out inspection-category items (counted separately)
    const reportableItems = lineItems.filter(
      (li) => !isInspectionCategory(li.category)
    );

    if (reportableItems.length === 0) {
      // Job with no non-inspection line items — still include as a row
      rows.push(
        toCSVRow([
          roStr,
          job.id,
          job.date_finished,
          job.date_received,
          customerName,
          customer?.phone,
          customer?.email,
          customer?.customer_type,
          customer?.fleet_account,
          vehicleStr,
          vehicle?.vin,
          vehicle?.license_plate,
          tech?.name,
          "",
          "",
          "(no line items)",
          "",
          "",
          "0.00",
          "",
          "",
          "",
          job.payment_status,
          job.payment_method,
          job.paid_at,
          job.notes,
        ])
      );
      return;
    }

    reportableItems.forEach((li) => {
      const cost =
        li.type === "part" && li.cost != null
          ? (li.cost * li.quantity).toFixed(2)
          : "";
      const profit =
        li.type === "part" && li.cost != null
          ? ((li.total || 0) - li.cost * li.quantity).toFixed(2)
          : "";

      grandTotal += li.total || 0;

      rows.push(
        toCSVRow([
          roStr,
          job.id,
          job.date_finished,
          job.date_received,
          customerName,
          customer?.phone,
          customer?.email,
          customer?.customer_type,
          customer?.fleet_account,
          vehicleStr,
          vehicle?.vin,
          vehicle?.license_plate,
          tech?.name,
          li.category || "Uncategorized",
          li.type,
          li.description,
          li.quantity,
          li.unit_cost?.toFixed(2),
          li.total?.toFixed(2),
          cost,
          profit,
          li.part_number,
          job.payment_status,
          job.payment_method,
          job.paid_at,
          job.notes,
        ])
      );
    });
  });

  // Add a blank line and grand total
  rows.push("");
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Job Revenue Total:", grandTotal.toFixed(2)]));

  // --- Inspection sheet (appended after a separator) ---
  rows.push("");
  rows.push("");
  rows.push("--- INSPECTIONS ---");

  const inspHeaders = [
    "Date",
    "State Inspections",
    "TNC Inspections",
    "State Revenue",
    "TNC Revenue",
    "State Cost",
    "Total Revenue",
    "Total Profit",
  ];
  rows.push(toCSVRow(inspHeaders));

  let inspTotalRevenue = 0;
  let inspTotalProfit = 0;

  dailyCounts.forEach((day) => {
    const stateRev = day.state_count * INSPECTION_RATE_STATE;
    const tncRev = day.tnc_count * INSPECTION_RATE_TNC;
    const stateCost = day.state_count * INSPECTION_COST_STATE;
    const dayRevenue = stateRev + tncRev;
    const dayProfit = dayRevenue - stateCost;
    inspTotalRevenue += dayRevenue;
    inspTotalProfit += dayProfit;

    rows.push(
      toCSVRow([
        day.date,
        day.state_count,
        day.tnc_count,
        stateRev.toFixed(2),
        tncRev.toFixed(2),
        stateCost.toFixed(2),
        dayRevenue.toFixed(2),
        dayProfit.toFixed(2),
      ])
    );
  });

  rows.push(
    toCSVRow([
      "",
      "",
      "",
      "",
      "",
      "Inspection Total:",
      inspTotalRevenue.toFixed(2),
      inspTotalProfit.toFixed(2),
    ])
  );

  // Grand total summary
  rows.push("");
  rows.push(
    toCSVRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "GRAND TOTAL REVENUE:",
      (grandTotal + inspTotalRevenue).toFixed(2),
    ])
  );

  const csv = rows.join("\r\n");

  // Build filename
  const filename = `shoppilot-revenue-${resolved.from}-to-${resolved.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
