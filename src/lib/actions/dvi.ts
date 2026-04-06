"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import { findOrCreateParkingVehicle } from "@/lib/parking-vehicle";
import { todayET } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const DVI_SERVICE = "dvi_inspection" as const;

// ── Template ────────────────────────────────────────────────

export const getTemplateWithItems = cache(async () => {
  const supabase = await createClient();

  // Get the default template
  const { data: template, error: tErr } = await supabase
    .from("dvi_templates")
    .select("id, name")
    .eq("is_default", true)
    .single();

  if (tErr || !template) return null;

  // Get categories + items in one query
  const { data: categories, error: cErr } = await supabase
    .from("dvi_template_categories")
    .select("id, name, sort_order, dvi_template_items(id, name, sort_order)")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });

  if (cErr) return null;

  return {
    ...template,
    categories: (categories ?? []).map((cat) => ({
      ...cat,
      items: (cat.dvi_template_items ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      ),
    })),
  };
});

// ── Shared Helpers ──────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type Template = NonNullable<Awaited<ReturnType<typeof getTemplateWithItems>>>;

async function insertResultRows(
  supabase: SupabaseClient,
  inspectionId: string,
  template: Template
): Promise<{ error?: string }> {
  const resultRows: {
    inspection_id: string;
    template_item_id: string;
    category_name: string;
    item_name: string;
    sort_order: number;
  }[] = [];

  let globalSort = 0;
  for (const category of template.categories) {
    for (const item of category.items) {
      resultRows.push({
        inspection_id: inspectionId,
        template_item_id: item.id,
        category_name: category.name,
        item_name: item.name,
        sort_order: globalSort++,
      });
    }
  }

  if (resultRows.length > 0) {
    const { error } = await supabase.from("dvi_results").insert(resultRows);
    if (error) return { error: error.message };
  }

  return {};
}

// ── Inspections ─────────────────────────────────────────────

export async function startInspection(jobId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const template = await getTemplateWithItems();
  if (!template) return { error: "No default inspection template found" };

  const supabase = await createClient();

  // Check if inspection already exists
  const { data: existing } = await supabase
    .from("dvi_inspections")
    .select("id")
    .eq("job_id", jobId)
    .single();

  if (existing) return { error: "An inspection already exists for this job" };

  // Look up the job's vehicle and customer for direct linking
  const { data: job } = await supabase
    .from("jobs")
    .select("vehicle_id, customer_id")
    .eq("id", jobId)
    .single();

  // Create the inspection
  const { data: inspection, error: insErr } = await supabase
    .from("dvi_inspections")
    .insert({
      job_id: jobId,
      vehicle_id: job?.vehicle_id ?? null,
      customer_id: job?.customer_id ?? null,
      template_id: template.id,
      tech_id: user.id,
    })
    .select()
    .single();

  if (insErr) return { error: insErr.message };

  const rowResult = await insertResultRows(supabase, inspection.id, template);
  if (rowResult.error) return { error: rowResult.error };

  revalidatePath(`/dvi/${jobId}`);
  return { data: { inspectionId: inspection.id } };
}

export async function startStandaloneInspection(params: {
  vehicleId: string;
  customerId: string;
  parkingReservationId?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const template = await getTemplateWithItems();
  if (!template) return { error: "No default inspection template found" };

  const supabase = await createClient();

  const { data: inspection, error: insErr } = await supabase
    .from("dvi_inspections")
    .insert({
      job_id: null,
      vehicle_id: params.vehicleId,
      customer_id: params.customerId,
      parking_reservation_id: params.parkingReservationId ?? null,
      template_id: template.id,
      tech_id: user.id,
    })
    .select()
    .single();

  if (insErr) return { error: insErr.message };

  const rowResult = await insertResultRows(supabase, inspection.id, template);
  if (rowResult.error) return { error: rowResult.error };

  revalidatePath("/dvi");
  return { data: { inspectionId: inspection.id } };
}

export const getInspectionForJob = cache(async (jobId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dvi_inspections")
    .select("*, dvi_results(*, dvi_photos(*))")
    .eq("job_id", jobId)
    .single();

  if (error) return null;
  return data;
});

export const getInspectionById = cache(async (inspectionId: string) => {
  const admin = createAdminClient();

  // Fetch inspection + results
  const { data: inspection, error } = await admin
    .from("dvi_inspections")
    .select("*, dvi_results(*, dvi_photos(*))")
    .eq("id", inspectionId)
    .single();

  if (error || !inspection) return null;

  // Fetch vehicle and customer via direct FKs (separate queries to avoid PostgREST relationship issues)
  const [{ data: vehicle }, { data: customer }] = await Promise.all([
    inspection.vehicle_id
      ? admin.from("vehicles").select("id, year, make, model, color, vin").eq("id", inspection.vehicle_id).single()
      : Promise.resolve({ data: null }),
    inspection.customer_id
      ? admin.from("customers").select("id, first_name, last_name, phone, email").eq("id", inspection.customer_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return { ...inspection, vehicles: vehicle, customers: customer };
});

export async function getInspectionByToken(token: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("dvi_inspections")
    .select(
      "*, dvi_results(*, dvi_photos(*)), jobs(id, status, payment_status, ro_number, customer_id, customers(id, first_name, last_name, phone, email), vehicles(year, make, model, color, vin)), vehicles(year, make, model, color, vin), customers(id, first_name, last_name, phone, email)"
    )
    .eq("approval_token", token)
    .single();

  if (error) return null;
  return data;
}

// ── Results ─────────────────────────────────────────────────

export async function updateResult(
  resultId: string,
  update: { condition?: "good" | "monitor" | "attention" | null; note?: string | null }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("dvi_results")
    .update(update)
    .eq("id", resultId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function completeInspection(inspectionId: string) {
  const supabase = await createClient();

  // Fetch results + inspection info in parallel
  const [{ data: results }, { data: inspection }] = await Promise.all([
    supabase
      .from("dvi_results")
      .select("id, condition")
      .eq("inspection_id", inspectionId),
    supabase
      .from("dvi_inspections")
      .select(
        "job_id, parking_reservation_id, vehicle_id, jobs(ro_number, vehicles(year, make, model))"
      )
      .eq("id", inspectionId)
      .single(),
  ]);

  // Verify all items are rated
  const unrated = (results ?? []).filter((r) => r.condition === null);
  if (unrated.length > 0) {
    return { error: `${unrated.length} item(s) still need to be rated` };
  }

  // Set completed
  const { error } = await supabase
    .from("dvi_inspections")
    .update({
      status: "completed" as const,
      completed_at: new Date().toISOString(),
    })
    .eq("id", inspectionId);

  if (error) return { error: error.message };

  // Count conditions in a single pass
  const counts = { good: 0, monitor: 0, attention: 0 };
  for (const r of results ?? []) {
    if (r.condition === "good") counts.good++;
    else if (r.condition === "monitor") counts.monitor++;
    else if (r.condition === "attention") counts.attention++;
  }

  // Resolve vehicle data — prefer job's vehicle, fall back to direct FK lookup
  const jobData = inspection?.jobs as { ro_number: number | null; vehicles: { year: number | null; make: string | null; model: string | null } | null } | null;
  let vehicle = jobData?.vehicles ?? null;
  const roNumber = jobData?.ro_number ?? null;

  // If no vehicle from job, fetch directly
  if (!vehicle && inspection?.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("year, make, model")
      .eq("id", inspection.vehicle_id)
      .single();
    vehicle = v;
  }

  // Fire-and-forget internal SMS notification to shop line
  if (vehicle) {
    import("@/lib/messaging/templates")
      .then(({ dviCompletedInternalSMS }) => {
        return import("@/lib/quo/client").then(({ sendSMS }) => {
          const from = process.env.QUO_SHOP_PHONE_NUMBER;
          const to = process.env.QUO_SHOP_PHONE_NUMBER;
          if (!from || !to) return;
          return sendSMS({
            to,
            body: dviCompletedInternalSMS({
              year: vehicle?.year,
              make: vehicle?.make,
              model: vehicle?.model,
              roNumber,
              good: counts.good,
              monitor: counts.monitor,
              attention: counts.attention,
            }),
            from,
          });
        });
      })
      .catch((err) => console.error("Failed to send DVI completion SMS:", err));
  }

  // Mark DVI service as completed on parking reservation (atomic)
  if (inspection?.parking_reservation_id) {
    const { error: rpcErr } = await supabase.rpc("append_service_completed", {
      reservation_id: inspection.parking_reservation_id,
      service_value: DVI_SERVICE,
    });
    if (rpcErr) console.error("Failed to mark DVI completed on reservation:", rpcErr);
  }

  // Revalidate views
  if (inspection?.job_id) {
    revalidatePath(`/dvi/${inspection.job_id}`);
    revalidatePath(`/jobs/${inspection.job_id}`);
  }
  revalidatePath("/dvi");

  return { success: true, counts };
}

export async function reopenInspection(inspectionId: string) {
  const supabase = await createClient();

  // Only reopen if not sent
  const { data: inspection } = await supabase
    .from("dvi_inspections")
    .select("status, job_id")
    .eq("id", inspectionId)
    .single();

  if (!inspection) return { error: "Inspection not found" };
  if (inspection.status === "sent") return { error: "Cannot reopen a sent inspection" };

  const { error } = await supabase
    .from("dvi_inspections")
    .update({ status: "in_progress" as const, completed_at: null })
    .eq("id", inspectionId);

  if (error) return { error: error.message };

  if (inspection.job_id) {
    revalidatePath(`/dvi/${inspection.job_id}`);
  }
  revalidatePath("/dvi");
  return { success: true };
}

// ── Tech Job List ───────────────────────────────────────────

export async function getTechJobs() {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, status, ro_number, notes, customers(id, first_name, last_name), vehicles(id, year, make, model), dvi_inspections(status)"
    )
    .neq("status", "complete")
    .order("date_received", { ascending: false });

  if (error) return [];

  // Map dvi_inspections to a flat dvi_status field
  return (data ?? []).map((job) => {
    const raw = job.dvi_inspections;
    // Supabase returns an object (one-to-one) or array depending on FK uniqueness
    const dvi_status = Array.isArray(raw)
      ? (raw.length > 0 ? (raw[0] as { status: string }).status : null)
      : (raw as { status: string } | null)?.status ?? null;
    return { ...job, dvi_status };
  });
}

// ── Sending ─────────────────────────────────────────────────

export async function sendInspection(
  inspectionId: string,
  options: {
    mode: "informational" | "recommendations";
    recommendedItems?: { resultId: string; description: string; price: number }[];
    customerNote?: string;
  }
) {
  const supabase = await createClient();

  const token = crypto.randomUUID();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dviUrl = `${appUrl}/inspect/${token}`;

  // Update recommended items if in recommendations mode
  if (options.mode === "recommendations" && options.recommendedItems) {
    await Promise.all(
      options.recommendedItems.map((item) =>
        supabase
          .from("dvi_results")
          .update({
            is_recommended: true,
            recommended_description: item.description,
            recommended_price: item.price,
          })
          .eq("id", item.resultId)
      )
    );
  }

  // Update inspection status
  const { error } = await supabase
    .from("dvi_inspections")
    .update({
      status: "sent" as const,
      approval_token: token,
      send_mode: options.mode,
      sent_at: new Date().toISOString(),
      customer_note: options.customerNote || null,
    })
    .eq("id", inspectionId);

  if (error) return { error: error.message };

  // Get inspection with job fallback for customer/vehicle
  const { data: inspection } = await supabase
    .from("dvi_inspections")
    .select(
      "job_id, customer_id, vehicle_id, jobs(id, customer_id, customers(id, first_name, phone, email), vehicles(year, make, model))"
    )
    .eq("id", inspectionId)
    .single();

  const job = inspection?.jobs as {
    id: string;
    customer_id: string;
    customers: { id: string; first_name: string; phone: string | null; email: string | null } | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null;
  } | null;

  // Resolve customer/vehicle: prefer job's nested data, fall back to direct FK lookups
  let customer = job?.customers ?? null;
  let vehicle = job?.vehicles ?? null;
  const resolvedJobId = job?.id;

  // If no customer from job, fetch directly
  if (!customer && inspection?.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("id, first_name, phone, email")
      .eq("id", inspection.customer_id)
      .single();
    customer = c;
  }

  // If no vehicle from job, fetch directly
  if (!vehicle && inspection?.vehicle_id) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("year, make, model")
      .eq("id", inspection.vehicle_id)
      .single();
    vehicle = v;
  }

  // Fire-and-forget SMS to customer
  if (customer?.phone) {
    import("@/lib/messaging/templates")
      .then(({ dviReportSMS }) => {
        return import("@/lib/actions/messages").then(({ sendCustomerSMS }) =>
          sendCustomerSMS({
            customerId: customer.id,
            body: dviReportSMS({
              firstName: customer.first_name,
              year: vehicle?.year,
              make: vehicle?.make,
              model: vehicle?.model,
              link: dviUrl,
            }),
            jobId: resolvedJobId,
            line: "shop",
          })
        );
      })
      .catch((err) => console.error("Failed to send DVI SMS:", err));
  }

  // Fire-and-forget email to customer
  if (customer?.email) {
    import("@/lib/actions/email")
      .then(({ sendCustomerEmail }) => {
        const vehicleDesc = [vehicle?.year, vehicle?.make, vehicle?.model]
          .filter(Boolean)
          .join(" ");
        return import("@/lib/resend/templates").then(({ dviReportEmail }) => {
          const { subject, html } = dviReportEmail({
            customerName: customer.first_name,
            vehicleDesc,
            link: dviUrl,
          });
          return sendCustomerEmail({
            customerId: customer.id,
            subject,
            html,
            jobId: resolvedJobId,
          });
        });
      })
      .catch((err) => console.error("Failed to send DVI email:", err));
  }

  if (inspection?.job_id) {
    revalidatePath(`/jobs/${inspection.job_id}`);
  }
  revalidatePath("/dvi");

  return { data: { dviUrl } };
}

// ── Recommendation Approval ─────────────────────────────────

export async function approveRecommendations(
  token: string,
  selectedResultIds: string[]
) {
  const admin = createAdminClient();

  // Fetch inspection by token
  const { data: inspection, error: fetchErr } = await admin
    .from("dvi_inspections")
    .select(
      "id, status, send_mode, job_id, customer_id, vehicle_id, jobs(id, status, payment_status, ro_number, customer_id, customers(id, first_name, last_name), vehicles(year, make, model))"
    )
    .eq("approval_token", token)
    .single();

  if (fetchErr || !inspection) return { error: "Inspection not found" };
  if (inspection.status !== "sent") return { error: "Inspection is not in sent status" };
  if (inspection.send_mode !== "recommendations") return { error: "Inspection was not sent with recommendations" };

  let jobId = inspection.job_id;
  let job = inspection.jobs as {
    id: string;
    status: string;
    payment_status: string;
    ro_number: number | null;
    customer_id: string;
    customers: { id: string; first_name: string; last_name: string } | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null;
  } | null;

  // If no job linked, auto-create one for the standalone DVI
  if (!jobId) {
    if (!inspection.customer_id) return { error: "No customer linked to this inspection" };

    // Fetch customer/vehicle separately (PostgREST doesn't resolve late-added FKs on dvi_inspections)
    const [{ data: custData }, { data: vehData }] = await Promise.all([
      admin.from("customers").select("id, first_name, last_name").eq("id", inspection.customer_id).single(),
      inspection.vehicle_id
        ? admin.from("vehicles").select("year, make, model").eq("id", inspection.vehicle_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const { data: newJob, error: jobErr } = await admin
      .from("jobs")
      .insert({
        customer_id: inspection.customer_id,
        vehicle_id: inspection.vehicle_id,
        status: "not_started",
        title: "DVI Recommended Services",
        notes: "Auto-created from parking DVI recommendation approval",
        date_received: todayET(),
        payment_status: "unpaid",
      })
      .select("id, status, payment_status, ro_number")
      .single();

    if (jobErr || !newJob) return { error: "Failed to create job for recommendations" };

    // Link inspection to the new job
    await admin
      .from("dvi_inspections")
      .update({ job_id: newJob.id })
      .eq("id", inspection.id);

    jobId = newJob.id;
    job = {
      ...newJob,
      customer_id: inspection.customer_id!,
      customers: custData,
      vehicles: vehData,
    };
  }

  // Check job is still open
  if (job?.status === "complete" || job?.payment_status === "paid") {
    return { error: "This job has already been completed" };
  }

  // Fetch the selected results
  const { data: results } = await admin
    .from("dvi_results")
    .select("id, item_name, category_name, recommended_description, recommended_price")
    .in("id", selectedResultIds)
    .eq("inspection_id", inspection.id);

  if (!results || results.length === 0) return { error: "No items selected" };

  // Create job line items
  const lineItems = results.map((r) => ({
    job_id: jobId!,
    type: "labor" as const,
    description: r.recommended_description || `${r.item_name} — needs attention`,
    quantity: 1,
    unit_cost: r.recommended_price ?? 0,
    category: r.category_name,
  }));

  const { error: insertErr } = await admin
    .from("job_line_items")
    .insert(lineItems);

  if (insertErr) return { error: insertErr.message };

  // Compute total
  const total = results.reduce((sum, r) => sum + (Number(r.recommended_price) || 0), 0);
  const approvedItemNames = results.map((r) => r.item_name);

  // Fire-and-forget internal SMS to shop line
  const customer = job?.customers;
  const vehicle = job?.vehicles;
  import("@/lib/messaging/templates")
    .then(({ dviApprovalInternalSMS }) => {
      return import("@/lib/quo/client").then(({ sendSMS }) => {
        const from = process.env.QUO_SHOP_PHONE_NUMBER;
        if (!from) return;
        return sendSMS({
          to: from,
          body: dviApprovalInternalSMS({
            customerName: customer
              ? `${customer.first_name} ${customer.last_name}`
              : "Customer",
            year: vehicle?.year,
            make: vehicle?.make,
            model: vehicle?.model,
            roNumber: job?.ro_number ?? null,
            approvedItems: approvedItemNames,
            total,
          }),
          from,
        });
      });
    })
    .catch((err) => console.error("Failed to send DVI approval SMS:", err));

  return { success: true, approvedCount: results.length, total };
}

// ── Vehicle History ─────────────────────────────────────────

export async function getInspectionsForVehicle(vehicleId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dvi_inspections")
    .select(
      "id, status, created_at, completed_at, job_id, jobs(id, ro_number), dvi_results(condition)"
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((insp) => {
    const results = (insp.dvi_results ?? []) as { condition: string | null }[];
    return {
      id: insp.id,
      status: insp.status,
      created_at: insp.created_at,
      completed_at: insp.completed_at,
      job: insp.jobs,
      counts: {
        good: results.filter((r) => r.condition === "good").length,
        monitor: results.filter((r) => r.condition === "monitor").length,
        attention: results.filter((r) => r.condition === "attention").length,
        total: results.length,
      },
    };
  });
}

// ── Parking DVI Requests ────────────────────────────────────

export async function getPendingParkingDviRequests() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("parking_reservations")
    .select(
      "id, first_name, last_name, phone, make, model, color, license_plate, lot, drop_off_date, pick_up_date, status, customer_id, services_interested, services_completed"
    )
    .contains("services_interested", [DVI_SERVICE])
    .in("status", ["reserved", "checked_in"])
    .order("drop_off_date", { ascending: true });

  // Filter out already-completed DVIs (services_completed contains "dvi_inspection")
  return (data ?? []).filter(
    (r) => !r.services_completed?.includes(DVI_SERVICE)
  );
}

export async function getPendingDviRequestCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("parking_reservations")
    .select("id", { count: "exact", head: true })
    .contains("services_interested", [DVI_SERVICE])
    .in("status", ["reserved", "checked_in"])
    .not("services_completed", "cs", `{"${DVI_SERVICE}"}`);

  if (error) return 0;
  return count || 0;
}

export async function startParkingDvi(reservationId: string) {
  const supabase = await createClient();

  // Fetch reservation
  const { data: reservation, error: resErr } = await supabase
    .from("parking_reservations")
    .select("id, customer_id, make, model, color, license_plate")
    .eq("id", reservationId)
    .single();

  if (resErr || !reservation) return { error: "Reservation not found" };
  if (!reservation.customer_id) return { error: "No customer linked to this reservation" };

  const vehicleId = await findOrCreateParkingVehicle({
    customerId: reservation.customer_id,
    make: reservation.make,
    model: reservation.model,
    color: reservation.color,
    licensePlate: reservation.license_plate,
  });

  if (!vehicleId) return { error: "Failed to create vehicle record" };

  // Start standalone inspection
  return startStandaloneInspection({
    vehicleId,
    customerId: reservation.customer_id,
    parkingReservationId: reservation.id,
  });
}
