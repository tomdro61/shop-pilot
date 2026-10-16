import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { resolveDateRange } from "@/lib/utils/date-range";
import { isInspectionCategory, isRevenueJob } from "@/lib/utils/revenue";
import { toCSVRow } from "@/lib/utils/csv";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { assertComplete } from "@/lib/supabase/assert-complete";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
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
type InspectionDayRow = { date: string; state_count: number; tnc_count: number };
type ManualIncomeRow = Awaited<ReturnType<typeof getManualIncomeForRange>>[number];

const CUSTOMER_TYPES = ["all", "retail", "fleet", "parking"] as const;
type CustomerTypeParam = (typeof CUSTOMER_TYPES)[number];

function parseCustomerType(raw: string | null): CustomerTypeParam | null {
  if (raw === null || raw === "") return "all";
  return (CUSTOMER_TYPES as readonly string[]).includes(raw) ? (raw as CustomerTypeParam) : null;
}

// Pads a label/value pair out to the "Total" column of the job sheet.
function totalRow(label: string, value: string): string {
  return toCSVRow([...Array<string>(17).fill(""), label, value]);
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
  const customerType = parseCustomerType(searchParams.get("customerType"));
  if (customerType === null) {
    return NextResponse.json({ error: "Invalid customerType" }, { status: 400 });
  }
  const filterType = customerType === "all" ? null : customerType;
  const isFiltered = filterType !== null;
  const resolved = resolveDateRange(range, from, to);

  // Mirrors getReportData: a customer-type filter is an inner join on
  // customers, and inspections + manual income (which carry no customer type)
  // are left out of a filtered export, as they are on screen.
  const jobSelect: string = `id, ro_number, status, date_received, date_finished, payment_status, payment_method, paid_at, notes,
     assigned_tech, users!jobs_assigned_tech_fkey(name),
     ${isFiltered ? "customers!inner" : "customers"}(first_name, last_name, phone, email, customer_type, fleet_account),
     vehicles(year, make, model, vin, license_plate),
     job_line_items(type, description, quantity, unit_cost, total, cost, part_number, category)`;

  // Every read below used to discard `error` and fall back to `[]`, so any
  // failure produced a well-formed CSV reading GRAND TOTAL REVENUE: 0.00 —
  // which opens in Excel and looks authoritative. They are also the reason the
  // "All Time" preset (2000-01-01) silently truncated at 1000 jobs.
  //
  // `.order("date_finished")` alone is NOT a stable sort — many jobs share a
  // completion date — so paging on it would duplicate and drop rows. The `id`
  // tiebreaker is what makes the paging deterministic; keep both.
  let jobs: ExportJobRow[];
  let dailyCounts: InspectionDayRow[];
  let manualEntries: ManualIncomeRow[];
  try {
    [jobs, dailyCounts, manualEntries] = await Promise.all([
      fetchAllRows<ExportJobRow>((pageFrom, pageTo) => {
        let q = supabase
          .from("jobs")
          .select(jobSelect, { count: "exact" })
          .eq("status", "complete")
          .gte("date_finished", resolved.from)
          .lte("date_finished", resolved.to)
          .order("date_finished", { ascending: true })
          .order("id", { ascending: true })
          .range(pageFrom, pageTo);
        if (filterType) q = q.eq("customers.customer_type", filterType);
        return q.returns<ExportJobRow[]>();
      }, "jobs for revenue export"),
      isFiltered
        ? Promise.resolve([])
        : supabase
            .from("daily_inspection_counts")
            .select("date, state_count, tnc_count", { count: "exact" })
            .gte("date", resolved.from)
            .lte("date", resolved.to)
            .order("date", { ascending: true })
            .then((r) => assertComplete(r, "inspection counts for export")),
      isFiltered ? Promise.resolve([]) : getManualIncomeForRange(resolved.from, resolved.to),
    ]);
  } catch (err) {
    console.error("[reports-export] data fetch failed", {
      userId: auth.userId,
      range,
      customerType,
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
  let revenueJobCount = 0;

  jobs.forEach((job) => {
    // No casts — the row is typed by ExportJobRow above. The casts that used to
    // sit here re-declared `total` as non-null, which is false at the DB layer
    // and is exactly how a shape mismatch stays invisible.
    const customer = job.customers;
    const vehicle = job.vehicles;
    const tech = job.users;
    const lineItems = job.job_line_items ?? [];
    if (isRevenueJob(lineItems)) revenueJobCount++;

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
          lineItems.length > 0 ? "(inspection only)" : "(no line items)",
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

  // Same definitions as the Revenue report: inspection-only jobs are not
  // counted as jobs, and the average ticket is job revenue only.
  const avgTicket = revenueJobCount > 0 ? grandTotal / revenueJobCount : 0;

  rows.push("");
  rows.push(totalRow("Job Revenue Total:", grandTotal.toFixed(2)));
  rows.push(totalRow("Jobs Completed:", String(revenueJobCount)));
  rows.push(totalRow("Avg Ticket:", avgTicket.toFixed(2)));

  let inspTotalRevenue = 0;
  let manualTotal = 0;

  if (!isFiltered) {
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

    // --- Manual income sheet ---
    rows.push("");
    rows.push("");
    rows.push("--- MANUAL INCOME ---");
    rows.push(toCSVRow(["Date", "Category", "Amount", "Shop Keep %", "Shop Profit"]));

    let manualProfit = 0;
    [...manualEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((entry) => {
        const profit = entry.amount * (entry.shop_keep_pct / 100);
        manualTotal += entry.amount;
        manualProfit += profit;
        rows.push(
          toCSVRow([
            entry.date,
            entry.category,
            entry.amount.toFixed(2),
            entry.shop_keep_pct,
            profit.toFixed(2),
          ])
        );
      });

    rows.push(toCSVRow(["", "Manual Income Total:", manualTotal.toFixed(2), "", manualProfit.toFixed(2)]));
  }

  // Grand total summary
  rows.push("");
  rows.push(totalRow("GRAND TOTAL REVENUE:", (grandTotal + inspTotalRevenue + manualTotal).toFixed(2)));

  const csv = rows.join("\r\n");

  const typeSuffix = filterType ? `-${filterType}` : "";
  const filename = `shoppilot-revenue${typeSuffix}-${resolved.from}-to-${resolved.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
