"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";
import { revalidatePath } from "next/cache";

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

  // Build result rows from template items (denormalized)
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
        inspection_id: inspection.id,
        template_item_id: item.id,
        category_name: category.name,
        item_name: item.name,
        sort_order: globalSort++,
      });
    }
  }

  if (resultRows.length > 0) {
    const { error: resErr } = await supabase
      .from("dvi_results")
      .insert(resultRows);

    if (resErr) return { error: resErr.message };
  }

  revalidatePath(`/dvi/${jobId}`);
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
      .select("job_id, jobs(ro_number, vehicles(year, make, model))")
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

  // Fire-and-forget internal SMS notification to shop line
  if (inspection?.jobs) {
    const job = inspection.jobs as { ro_number: number | null; vehicles: { year: number | null; make: string | null; model: string | null } | null };
    const vehicle = job.vehicles;
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
              roNumber: job.ro_number,
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

  // Revalidate both tech and manager views
  if (inspection?.job_id) {
    revalidatePath(`/dvi/${inspection.job_id}`);
    revalidatePath(`/jobs/${inspection.job_id}`);
  }

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

  revalidatePath(`/dvi/${inspection.job_id}`);
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
    const inspections = job.dvi_inspections as { status: string }[] | null;
    const dvi_status = inspections && inspections.length > 0 ? inspections[0].status : null;
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

  // Get inspection with job/customer/vehicle for messaging
  const { data: inspection } = await supabase
    .from("dvi_inspections")
    .select(
      "job_id, jobs(id, customer_id, customers(id, first_name, phone, email), vehicles(year, make, model))"
    )
    .eq("id", inspectionId)
    .single();

  const job = inspection?.jobs as {
    id: string;
    customer_id: string;
    customers: { id: string; first_name: string; phone: string | null; email: string | null } | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null;
  } | null;

  const customer = job?.customers;

  // Fire-and-forget SMS to customer
  if (customer?.phone) {
    import("@/lib/messaging/templates")
      .then(({ dviReportSMS }) => {
        const vehicle = job?.vehicles;
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
            jobId: job!.id,
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
        return import("@/lib/resend/templates").then(({ dviReportEmail }) => {
          const vehicle = job?.vehicles;
          const vehicleDesc = [vehicle?.year, vehicle?.make, vehicle?.model]
            .filter(Boolean)
            .join(" ");
          const { subject, html } = dviReportEmail({
            customerName: customer.first_name,
            vehicleDesc,
            link: dviUrl,
          });
          return sendCustomerEmail({
            customerId: customer.id,
            subject,
            html,
            jobId: job!.id,
          });
        });
      })
      .catch((err) => console.error("Failed to send DVI email:", err));
  }

  if (inspection?.job_id) {
    revalidatePath(`/jobs/${inspection.job_id}`);
  }

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
      "id, status, send_mode, job_id, jobs(id, status, payment_status, ro_number, customer_id, customers(id, first_name, last_name), vehicles(year, make, model))"
    )
    .eq("approval_token", token)
    .single();

  if (fetchErr || !inspection) return { error: "Inspection not found" };
  if (!inspection.job_id) return { error: "This inspection is no longer linked to a job" };
  if (inspection.status !== "sent") return { error: "Inspection is not in sent status" };
  if (inspection.send_mode !== "recommendations") return { error: "Inspection was not sent with recommendations" };

  // Check job is still open
  const job = inspection.jobs as {
    id: string;
    status: string;
    payment_status: string;
    ro_number: number | null;
    customer_id: string;
    customers: { id: string; first_name: string; last_name: string } | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null;
  } | null;

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
    job_id: inspection.job_id!,
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
            roNumber: job?.ro_number,
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
