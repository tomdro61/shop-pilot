import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { INSPECTION_CATEGORIES } from "@/lib/utils/revenue";
import { MA_SALES_TAX_RATE } from "@/lib/constants";
import { getShopSettings } from "@/lib/actions/settings";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSVRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => (f == null || f === "" ? "" : escapeCSV(String(f))))
    .join(",");
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export async function GET(req: NextRequest) {
  const auth = await requireManager();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = req.nextUrl;
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const customerType = searchParams.get("customerType");

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : null;
  if (Number.isNaN(year) || (month !== null && (Number.isNaN(month) || month < 1 || month > 12))) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }
  const isFiltered = !!(customerType && customerType !== "all");

  const supabase = await createClient();

  // Live rate from settings, matching the on-screen Tax Summary. A job with sales
  // tax turned off contributes 0 taxable parts + 0 tax — its parts are still billed
  // in Subtotal/Total but are non-taxable (e.g. outsourced parts).
  const settings = await getShopSettings();
  const taxRate = settings?.tax_rate ?? MA_SALES_TAX_RATE;

  const jobSelect = isFiltered
    ? `id, ro_number, paid_at, date_finished, payment_method, charge_sales_tax,
       customers!inner(first_name, last_name, customer_type),
       vehicles(year, make, model, license_plate),
       job_line_items(type, description, quantity, unit_cost, total, cost, category, part_number)`
    : `id, ro_number, paid_at, date_finished, payment_method, charge_sales_tax,
       customers(first_name, last_name, customer_type),
       vehicles(year, make, model, license_plate),
       job_line_items(type, description, quantity, unit_cost, total, cost, category, part_number)`;

  let jobQuery = supabase
    .from("jobs")
    .select(jobSelect)
    .eq("payment_status", "paid");
  if (isFiltered) {
    jobQuery = jobQuery.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
  }

  // Manual income: same year-range as reports.ts:629, then bucketed by month below.
  // getManualIncomeForRange throws on infra error — handle it explicitly so the operator
  // sees a logged, contextual 500 instead of an opaque Next.js error.
  let jobResult: Awaited<typeof jobQuery>;
  let manualEntries: Awaited<ReturnType<typeof getManualIncomeForRange>>;
  try {
    [jobResult, manualEntries] = await Promise.all([
      jobQuery,
      isFiltered ? Promise.resolve([]) : getManualIncomeForRange(`${year}-01-01`, `${year}-12-31`),
    ]);
  } catch (err) {
    console.error("[tax-audit] data fetch failed", {
      userId: auth.userId,
      year,
      month,
      customerType,
      error: err instanceof Error ? err.message : err,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch report data" },
      { status: 500 }
    );
  }

  if (jobResult.error) {
    console.error("[tax-audit] job query failed", {
      userId: auth.userId,
      year,
      month,
      customerType,
      error: jobResult.error,
    });
    return NextResponse.json({ error: jobResult.error.message }, { status: 500 });
  }

  type LineItem = {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
    total: number;
    cost: number | null;
    category: string | null;
    part_number: string | null;
  };
  type Customer = { first_name: string; last_name: string; customer_type: string | null };
  type Vehicle = { year: number | null; make: string | null; model: string | null; license_plate: string | null };
  type JobRow = {
    ro_number: number | null;
    paidDateET: string;
    monthNum: number;
    payment_method: string | null;
    customer: Customer | null;
    vehicle: Vehicle | null;
    lineItems: LineItem[];
    labor: number;
    parts: number;
    taxableParts: number;
    subtotal: number;
    tax: number;
    total: number;
  };

  const filteredJobs: JobRow[] = [];
  for (const j of jobResult.data ?? []) {
    const job = j as {
      ro_number: number | null;
      paid_at: string | null;
      date_finished: string | null;
      payment_method: string | null;
      charge_sales_tax: boolean;
      customers: Customer | null;
      vehicles: Vehicle | null;
      job_line_items: LineItem[] | null;
    };
    const dateStr = job.paid_at || job.date_finished;
    if (!dateStr) continue;

    const utcDate = new Date(dateStr.includes("T") ? dateStr : dateStr + "T12:00:00Z");
    const etDateStr = utcDate.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const [etYearStr, etMonthStr] = etDateStr.split("-");
    const etYear = parseInt(etYearStr, 10);
    const etMonth = parseInt(etMonthStr, 10);
    if (Number.isNaN(etYear) || Number.isNaN(etMonth)) {
      console.warn("[tax-audit] dropped job with unparseable date", {
        ro: job.ro_number,
        dateStr,
      });
      continue;
    }
    if (etYear !== year) continue;
    if (month !== null && etMonth !== month) continue;

    const lineItems = (job.job_line_items ?? []).filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
    );

    let labor = 0;
    let parts = 0;
    for (const li of lineItems) {
      const t = li.total || 0;
      if (li.type === "labor") labor += t;
      else if (li.type === "part") parts += t;
    }
    // Parts are billed either way, but only taxable when the job charges tax.
    const taxableParts = job.charge_sales_tax !== false ? parts : 0;
    const subtotal = Math.round((labor + parts) * 100) / 100;
    const tax = Math.round(taxableParts * taxRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    filteredJobs.push({
      ro_number: job.ro_number,
      paidDateET: etDateStr,
      monthNum: etMonth,
      payment_method: job.payment_method,
      customer: job.customers,
      vehicle: job.vehicles,
      lineItems,
      labor,
      parts,
      taxableParts,
      subtotal,
      tax,
      total,
    });
  }

  filteredJobs.sort((a, b) => a.paidDateET.localeCompare(b.paidDateET));

  // Bucket manual income to the same year/month filter the jobs use.
  type ManualRow = { date: string; amount: number; category: string; monthNum: number };
  const filteredManual: ManualRow[] = [];
  for (const entry of manualEntries) {
    if (!entry.date) continue;
    const m = parseInt(entry.date.substring(5, 7), 10);
    const y = parseInt(entry.date.substring(0, 4), 10);
    if (Number.isNaN(y) || Number.isNaN(m)) continue;
    if (y !== year) continue;
    if (month !== null && m !== month) continue;
    filteredManual.push({
      date: entry.date,
      amount: entry.amount,
      category: entry.category,
      monthNum: m,
    });
  }
  filteredManual.sort((a, b) => a.date.localeCompare(b.date));

  const rows: string[] = [];
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${year}` : `${year}`;
  const customerTypeLabel = isFiltered ? ` — ${customerType}` : "";

  rows.push(`Tax Audit — ${periodLabel}${customerTypeLabel}`);
  rows.push(`Generated: ${new Date().toISOString()}`);
  rows.push(`Tax rate applied: ${(taxRate * 100).toFixed(2)}%`);
  rows.push(`Source: jobs where payment_status='paid', bucketed by paid_at (ET); inspection-category line items excluded`);
  rows.push(`Note: jobs with sales tax turned off (e.g. outsourced parts) show 0 in Parts (Taxable) and 0 tax; those parts stay in Subtotal/Total as non-taxable revenue`);
  if (isFiltered) {
    rows.push(`Filter: customer_type='${customerType}' (jobs with no linked customer are excluded)`);
  }
  rows.push("");

  rows.push("JOB SUMMARIES");
  rows.push(toCSVRow([
    "Month", "RO #", "Paid Date", "Customer", "Vehicle", "License Plate",
    "Customer Type", "Payment Method", "Labor", "Parts (Taxable)", "Subtotal",
    "Sales Tax", "Total",
  ]));

  let totalLabor = 0;
  let totalParts = 0;
  let totalTax = 0;
  let totalSubtotal = 0;
  let totalJobGrand = 0;

  for (const j of filteredJobs) {
    const ro = j.ro_number ? `RO-${String(j.ro_number).padStart(4, "0")}` : "";
    const custName = j.customer ? `${j.customer.first_name} ${j.customer.last_name}` : "";
    const veh = j.vehicle
      ? [j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" ")
      : "";

    totalLabor += j.labor;
    totalParts += j.taxableParts;
    totalTax += j.tax;
    totalSubtotal += j.subtotal;
    totalJobGrand += j.total;

    rows.push(toCSVRow([
      MONTH_NAMES[j.monthNum - 1],
      ro,
      j.paidDateET,
      custName,
      veh,
      j.vehicle?.license_plate,
      j.customer?.customer_type,
      j.payment_method,
      fmt(j.labor),
      fmt(j.taxableParts),
      fmt(j.subtotal),
      fmt(j.tax),
      fmt(j.total),
    ]));
  }

  let totalManual = 0;
  if (filteredManual.length > 0) {
    rows.push("");
    rows.push("MANUAL INCOME (non-taxable, non-job revenue)");
    rows.push(toCSVRow(["Month", "Date", "Category", "Amount"]));
    for (const m of filteredManual) {
      totalManual += m.amount;
      rows.push(toCSVRow([
        MONTH_NAMES[m.monthNum - 1],
        m.date,
        m.category,
        fmt(m.amount),
      ]));
    }
  }

  const totalRevenueAll = Math.round((totalJobGrand + totalManual) * 100) / 100;

  rows.push("");
  rows.push("TOTALS");
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Total Labor:", fmt(totalLabor)]));
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Total Parts (Taxable):", fmt(totalParts)]));
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Subtotal (Labor + Parts):", fmt(totalSubtotal)]));
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Sales Tax Collected:", fmt(totalTax)]));
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Job Revenue (incl. tax):", fmt(totalJobGrand)]));
  if (filteredManual.length > 0) {
    rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Manual Income:", fmt(totalManual)]));
  }
  rows.push(toCSVRow(["", "", "", "", "", "", "", "", "Total Revenue:", fmt(totalRevenueAll)]));
  rows.push("");
  rows.push("");

  rows.push("LINE ITEM DETAIL");
  rows.push(toCSVRow([
    "Month", "RO #", "Paid Date", "Customer", "Category", "Type",
    "Description", "Qty", "Unit Price", "Total", "Wholesale Cost", "Part #",
  ]));

  for (const j of filteredJobs) {
    const ro = j.ro_number ? `RO-${String(j.ro_number).padStart(4, "0")}` : "";
    const custName = j.customer ? `${j.customer.first_name} ${j.customer.last_name}` : "";
    for (const li of j.lineItems) {
      const costStr =
        li.type === "part" && li.cost != null
          ? fmt(li.cost * li.quantity)
          : "";
      rows.push(toCSVRow([
        MONTH_NAMES[j.monthNum - 1],
        ro,
        j.paidDateET,
        custName,
        li.category || "",
        li.type,
        li.description,
        li.quantity,
        li.unit_cost?.toFixed(2),
        li.total?.toFixed(2),
        costStr,
        li.part_number,
      ]));
    }
  }

  console.log("[tax-audit] export generated", {
    userId: auth.userId,
    year,
    month,
    customerType,
    jobCount: filteredJobs.length,
    manualIncomeCount: filteredManual.length,
    totalRevenue: totalRevenueAll,
  });

  const csv = rows.join("\r\n");
  const filename = month
    ? `shoppilot-tax-audit-${year}-${String(month).padStart(2, "0")}.csv`
    : `shoppilot-tax-audit-${year}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
