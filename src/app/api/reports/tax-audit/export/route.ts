import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { getManualIncomeForRange } from "@/lib/actions/manual-income";
import { isInspectionCategory } from "@/lib/utils/revenue";
import { getShopSettings } from "@/lib/actions/settings";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

// Shape of `jobSelect` below — declared once because the select string is built
// dynamically (the customer-type filter adds an !inner join), which defeats
// Supabase's row-type inference.
type TaxAuditLineItem = {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
  total: number;
  cost: number | null;
  category: string | null;
  part_number: string | null;
};
type TaxAuditCustomer = { first_name: string; last_name: string; customer_type: string | null };
type TaxAuditVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
};
type TaxAuditJobRow = {
  ro_number: number | null;
  paid_at: string | null;
  date_finished: string | null;
  payment_method: string | null;
  charge_sales_tax: boolean;
  customers: TaxAuditCustomer | null;
  vehicles: TaxAuditVehicle | null;
  job_line_items: TaxAuditLineItem[] | null;
};

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
  const CUSTOMER_TYPES = ["retail", "fleet", "parking"] as const;
  const isFiltered = !!(customerType && customerType !== "all");
  // customers.customer_type is a Postgres enum, so an unrecognised value comes
  // back as a 22P02 from PostgREST and would surface as a 500 with raw Postgres
  // text — a URL typo reported as a server fault. Validate it like year/month.
  if (isFiltered && !CUSTOMER_TYPES.includes(customerType as (typeof CUSTOMER_TYPES)[number])) {
    return NextResponse.json({ error: "Invalid customerType" }, { status: 400 });
  }

  const supabase = await createClient();

  // Live rate from settings, matching the on-screen Tax Summary. A job with sales
  // tax turned off contributes 0 taxable parts + 0 tax — its parts are still billed
  // in Subtotal/Total but are non-taxable (e.g. outsourced parts).
  //
  // No fallback to the statutory rate. getShopSettings returns null for a
  // failed read AND for a missing/RLS-hidden row (it uses .single(), which
  // reports zero rows as a PGRST116 error) — so null never means "the shop
  // configured nothing, use the default". A fallback here isn't a default,
  // it's a guess stamped on a filing export and captioned as the rate applied.
  // getTaxReportData refuses for the same reason.
  const settings = await getShopSettings();
  if (!settings) {
    console.error("[tax-audit] shop settings unavailable", { userId: auth.userId, year, month });
    return NextResponse.json(
      { error: "Shop settings unavailable — refusing to export a tax audit with a guessed rate." },
      { status: 500 }
    );
  }
  const taxRate = settings.tax_rate;

  const jobSelect = isFiltered
    ? `id, ro_number, paid_at, date_finished, payment_method, charge_sales_tax,
       customers!inner(first_name, last_name, customer_type),
       vehicles(year, make, model, license_plate),
       job_line_items(type, description, quantity, unit_cost, total, cost, category, part_number)`
    : `id, ro_number, paid_at, date_finished, payment_method, charge_sales_tax,
       customers(first_name, last_name, customer_type),
       vehicles(year, make, model, license_plate),
       job_line_items(type, description, quantity, unit_cost, total, cost, category, part_number)`;

  // Bound to the requested year, and paged. This used to ask for every paid job
  // in the shop's history and narrow to `year` in JS below — at 983 paid jobs it
  // was ~17 rows from PostgREST's 1000-row cap, which truncates silently and
  // would have understated a filed return. The filter is deliberately a day
  // wider on each side than the JS bucketing (rows are bucketed by ET, `paid_at`
  // is a UTC instant), and paging covers the case the filter can't: every paid
  // job currently falls inside the current filing year, so narrowing by year
  // narrows nothing.
  const paidFrom = `${year - 1}-12-31T00:00:00Z`;
  const paidTo = `${year + 1}-01-02T00:00:00Z`;
  const finishedFrom = `${year - 1}-12-31`;
  const finishedTo = `${year + 1}-01-01`;

  const jobsPromise = fetchAllRows<TaxAuditJobRow>((from, to) => {
    let q = supabase
      .from("jobs")
      .select(jobSelect, { count: "exact" })
      .eq("payment_status", "paid")
      // `paid_at` when set, else `date_finished` — mirroring the fallback at the
      // bucketing step below, so neither shape is dropped.
      .or(
        `and(paid_at.gte.${paidFrom},paid_at.lte.${paidTo}),` +
          `and(paid_at.is.null,date_finished.gte.${finishedFrom},date_finished.lte.${finishedTo})`
      )
      .order("id", { ascending: true })
      .range(from, to);
    if (isFiltered) {
      q = q.eq("customers.customer_type", customerType as "retail" | "fleet" | "parking");
    }
    return q.returns<TaxAuditJobRow[]>();
  }, "jobs for tax audit export");

  // Manual income: same year-range as getTaxReportData, then bucketed by month
  // below. Both reads throw on infra error (and fetchAllRows also throws on a
  // truncated read) — handle it explicitly so the operator sees a logged,
  // contextual 500 instead of an opaque Next.js error or, worse, a CSV.
  let jobs: TaxAuditJobRow[];
  let manualEntries: Awaited<ReturnType<typeof getManualIncomeForRange>>;
  try {
    [jobs, manualEntries] = await Promise.all([
      jobsPromise,
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

  type JobRow = {
    ro_number: number | null;
    paidDateET: string;
    monthNum: number;
    payment_method: string | null;
    customer: TaxAuditCustomer | null;
    vehicle: TaxAuditVehicle | null;
    lineItems: TaxAuditLineItem[];
    labor: number;
    parts: number;
    taxableParts: number;
    chargeTax: boolean;
    subtotal: number;
    tax: number;
    total: number;
  };

  const filteredJobs: JobRow[] = [];
  for (const job of jobs) {
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
      (li) => !isInspectionCategory(li.category)
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
      chargeTax: job.charge_sales_tax !== false,
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
    // Manual income isn't attributable to a customer type, so it isn't read at
    // all under a filter. Say so — otherwise Total Revenue below is short by
    // the year's manual income under a caption that appears to list every
    // exclusion.
    rows.push(`Note: manual income is excluded under a customer-type filter — Total Revenue below is job revenue only`);
  }
  rows.push("");

  rows.push("JOB SUMMARIES");
  rows.push(toCSVRow([
    "Month", "RO #", "Paid Date", "Customer", "Vehicle", "License Plate",
    "Customer Type", "Payment Method", "Labor", "Parts (Taxable)", "Subtotal",
    "Sales Tax", "Total", "Tax Charged?",
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
      j.chargeTax ? "Yes" : "No",
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
