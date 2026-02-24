"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend/client";
import {
  estimateReadyEmail,
  paymentReceiptEmail,
} from "@/lib/resend/templates";
import { MA_SALES_TAX_RATE } from "@/lib/constants";

interface SendCustomerEmailParams {
  customerId: string;
  subject: string;
  html: string;
  jobId?: string;
}

export async function sendCustomerEmail({
  customerId,
  subject,
  html,
  jobId,
}: SendCustomerEmailParams): Promise<{
  sent: boolean;
  testMode?: boolean;
  error?: string;
}> {
  const supabase = await createClient();

  // Look up customer email
  const { data: customer, error: custError } = await supabase
    .from("customers")
    .select("id, first_name, last_name, email")
    .eq("id", customerId)
    .single();

  if (custError || !customer) return { sent: false, error: "Customer not found" };
  if (!customer.email) return { sent: false, error: "No email address on file" };

  const result = await sendEmail({ to: customer.email, subject, html });

  // Log to messages table
  const { error: insertError } = await supabase.from("messages").insert({
    customer_id: customerId,
    job_id: jobId ?? null,
    channel: "email" as const,
    direction: "out" as const,
    body: subject,
    status: result.success ? "sent" : "failed",
  });

  if (insertError) {
    console.error("Failed to log outbound email:", insertError.message);
  }

  if (!result.success) {
    return { sent: false, error: result.error };
  }

  return { sent: true, testMode: result.testMode };
}

export async function sendEstimateEmail({
  estimateId,
}: {
  estimateId: string;
}): Promise<{ sent: boolean; testMode?: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: estimate, error: fetchError } = await supabase
    .from("estimates")
    .select(
      "id, approval_token, tax_rate, jobs(id, title, customer_id, vehicle_id, customers(id, first_name, last_name, email), vehicles(id, year, make, model)), estimate_line_items(type, description, quantity, unit_cost)"
    )
    .eq("id", estimateId)
    .single();

  if (fetchError || !estimate) return { sent: false, error: "Estimate not found" };

  const job = estimate.jobs as {
    id: string;
    title: string | null;
    customer_id: string;
    vehicle_id: string | null;
    customers: { id: string; first_name: string; last_name: string; email: string | null } | null;
    vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
  } | null;

  if (!job?.customers) return { sent: false, error: "Customer not found" };
  if (!job.customers.email) return { sent: false, error: "No email address on file" };

  const vehicle = job.vehicles;
  const vehicleDesc = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle";

  const lineItems = (estimate.estimate_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
  }[];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const approvalUrl = `${appUrl}/estimates/approve/${estimate.approval_token}`;

  const { subject, html } = estimateReadyEmail({
    customerName: job.customers.first_name,
    jobTitle: job.title,
    vehicleDesc,
    approvalUrl,
    lineItems,
    taxRate: estimate.tax_rate ?? MA_SALES_TAX_RATE,
  });

  return sendCustomerEmail({
    customerId: job.customers.id,
    subject,
    html,
    jobId: job.id,
  });
}

export async function sendPaymentReceiptEmail({
  jobId,
}: {
  jobId: string;
}): Promise<{ sent: boolean; testMode?: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select(
      "id, title, customer_id, vehicle_id, payment_method, customers(id, first_name, last_name, email), vehicles(id, year, make, model), job_line_items(type, description, quantity, unit_cost)"
    )
    .eq("id", jobId)
    .single();

  if (fetchError || !job) return { sent: false, error: "Job not found" };

  const customer = job.customers as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  } | null;

  if (!customer) return { sent: false, error: "Customer not found" };
  if (!customer.email) return { sent: false, error: "No email address on file" };

  const vehicle = job.vehicles as {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;

  const vehicleDesc = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle";

  const lineItems = (job.job_line_items || []) as {
    type: "labor" | "part";
    description: string;
    quantity: number;
    unit_cost: number;
  }[];

  const laborTotal = lineItems
    .filter((li) => li.type === "labor")
    .reduce((sum, li) => sum + li.quantity * li.unit_cost, 0);
  const partsTotal = lineItems
    .filter((li) => li.type === "part")
    .reduce((sum, li) => sum + li.quantity * li.unit_cost, 0);
  const tax = partsTotal * MA_SALES_TAX_RATE;
  const total = laborTotal + partsTotal + tax;

  const { subject, html } = paymentReceiptEmail({
    customerName: customer.first_name,
    jobTitle: job.title,
    vehicleDesc,
    amount: total,
    paymentMethod: job.payment_method || "stripe",
    lineItems,
    taxRate: MA_SALES_TAX_RATE,
  });

  return sendCustomerEmail({
    customerId: customer.id,
    subject,
    html,
    jobId: job.id,
  });
}
