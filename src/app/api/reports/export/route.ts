import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/utils/date-range";
import { getInspectionCountsRange } from "@/lib/actions/inspections";
import {
  INSPECTION_CATEGORIES,
  calcInspectionRevenue,
} from "@/lib/utils/revenue";
import {
  INSPECTION_RATE_STATE,
  INSPECTION_RATE_TNC,
} from "@/lib/constants";

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
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const range = searchParams.get("range") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const resolved = resolveDateRange(range, from, to);

  // Fetch completed jobs with customer, vehicle, tech, and line items
  const { data: jobs } = await supabase
    .from("jobs")
    .select(
      `id, ro_number, status, date_received, date_finished, payment_status, payment_method, paid_at, notes,
       assigned_tech, users!jobs_assigned_tech_fkey(name),
       customers(first_name, last_name, phone, email, customer_type, fleet_account),
       vehicles(year, make, model, vin, license_plate),
       job_line_items(type, description, quantity, unit_cost, total, cost, part_number, category)`
    )
    .eq("status", "complete")
    .gte("date_finished", resolved.from)
    .lte("date_finished", resolved.to)
    .order("date_finished", { ascending: true });

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

  (jobs || []).forEach((job) => {
    const customer = job.customers as {
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
      customer_type: string | null;
      fleet_account: string | null;
    } | null;
    const vehicle = job.vehicles as {
      year: number | null;
      make: string | null;
      model: string | null;
      vin: string | null;
      license_plate: string | null;
    } | null;
    const tech = job.users as { name: string } | null;
    const lineItems =
      (job.job_line_items as {
        type: string;
        description: string;
        quantity: number;
        unit_cost: number;
        total: number;
        cost: number | null;
        part_number: string | null;
        category: string | null;
      }[]) || [];

    const roStr = job.ro_number ? `RO-${String(job.ro_number).padStart(4, "0")}` : "";
    const customerName = customer
      ? `${customer.first_name} ${customer.last_name}`
      : "";
    const vehicleStr = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
      : "";

    // Filter out inspection-category items (counted separately)
    const reportableItems = lineItems.filter(
      (li) => !INSPECTION_CATEGORIES.has(li.category ?? "")
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

  // Fetch daily inspection counts for the period
  const inspTotals = await getInspectionCountsRange(resolved.from, resolved.to);

  // We need daily breakdown — fetch directly
  const { data: dailyCounts } = await supabase
    .from("daily_inspection_counts")
    .select("date, state_count, tnc_count")
    .gte("date", resolved.from)
    .lte("date", resolved.to)
    .order("date", { ascending: true });

  let inspTotalRevenue = 0;
  let inspTotalProfit = 0;

  (dailyCounts || []).forEach((day) => {
    const stateRev = day.state_count * INSPECTION_RATE_STATE;
    const tncRev = day.tnc_count * INSPECTION_RATE_TNC;
    const stateCost = day.state_count * 11.5;
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
