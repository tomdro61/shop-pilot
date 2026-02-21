import {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
import {
  getVehiclesByCustomer,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "@/lib/actions/vehicles";
import {
  getJobs,
  getJob,
  createJob,
  updateJob,
  updateJobStatus,
  deleteJob,
  getJobCategories,
} from "@/lib/actions/jobs";
import {
  createLineItem,
  updateLineItem,
  deleteLineItem,
} from "@/lib/actions/job-line-items";
import {
  createEstimateFromJob,
  getEstimate,
  getEstimateForJob,
  sendEstimate,
  createEstimateLineItem,
  updateEstimateLineItem,
  deleteEstimateLineItem,
} from "@/lib/actions/estimates";
import {
  createInvoiceFromJob,
  getInvoiceForJob,
} from "@/lib/actions/invoices";
import { getTeamMembers, getTechnicians } from "@/lib/actions/team";
import { getReportData } from "@/lib/actions/reports";

type Input = Record<string, unknown>;

function str(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

function num(val: unknown, fallback?: number): number | undefined {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number(val);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

export async function executeToolCall(
  toolName: string,
  toolInput: Input
): Promise<string> {
  try {
    switch (toolName) {
      // ── Customers ──────────────────────────────────────────
      case "search_customers": {
        const results = await getCustomers(str(toolInput.search) || undefined);
        return JSON.stringify(results);
      }
      case "get_customer": {
        const result = await getCustomer(str(toolInput.id));
        return JSON.stringify(result ?? { error: "Customer not found" });
      }
      case "create_customer": {
        const result = await createCustomer({
          first_name: str(toolInput.first_name),
          last_name: str(toolInput.last_name),
          phone: str(toolInput.phone),
          email: str(toolInput.email),
          address: str(toolInput.address),
          notes: str(toolInput.notes),
        });
        return JSON.stringify(result);
      }
      case "update_customer": {
        // Fetch current customer to merge with partial update
        const current = await getCustomer(str(toolInput.id));
        if (!current) return JSON.stringify({ error: "Customer not found" });
        const result = await updateCustomer(str(toolInput.id), {
          first_name: str(toolInput.first_name, current.first_name),
          last_name: str(toolInput.last_name, current.last_name),
          phone: str(toolInput.phone, current.phone ?? ""),
          email: str(toolInput.email, current.email ?? ""),
          address: str(toolInput.address, current.address ?? ""),
          notes: str(toolInput.notes, current.notes ?? ""),
        });
        return JSON.stringify(result);
      }
      case "delete_customer": {
        const result = await deleteCustomer(str(toolInput.id));
        return JSON.stringify(result);
      }

      // ── Vehicles ───────────────────────────────────────────
      case "get_vehicles_for_customer": {
        const results = await getVehiclesByCustomer(str(toolInput.customer_id));
        return JSON.stringify(results);
      }
      case "get_vehicle": {
        const result = await getVehicle(str(toolInput.id));
        return JSON.stringify(result ?? { error: "Vehicle not found" });
      }
      case "create_vehicle": {
        const result = await createVehicle({
          customer_id: str(toolInput.customer_id),
          year: num(toolInput.year) ?? null,
          make: str(toolInput.make),
          model: str(toolInput.model),
          vin: str(toolInput.vin),
          license_plate: str(toolInput.license_plate),
          mileage: num(toolInput.mileage) ?? null,
          color: str(toolInput.color),
          notes: str(toolInput.notes),
        });
        return JSON.stringify(result);
      }
      case "update_vehicle": {
        const currentVehicle = await getVehicle(str(toolInput.id));
        if (!currentVehicle) return JSON.stringify({ error: "Vehicle not found" });
        const result = await updateVehicle(str(toolInput.id), {
          customer_id: str(toolInput.customer_id, currentVehicle.customer_id),
          year: num(toolInput.year) ?? currentVehicle.year ?? null,
          make: str(toolInput.make, currentVehicle.make ?? ""),
          model: str(toolInput.model, currentVehicle.model ?? ""),
          vin: str(toolInput.vin, currentVehicle.vin ?? ""),
          license_plate: str(toolInput.license_plate, currentVehicle.license_plate ?? ""),
          mileage: num(toolInput.mileage) ?? currentVehicle.mileage ?? null,
          color: str(toolInput.color, currentVehicle.color ?? ""),
          notes: str(toolInput.notes, currentVehicle.notes ?? ""),
        });
        return JSON.stringify(result);
      }
      case "delete_vehicle": {
        const result = await deleteVehicle(
          str(toolInput.id),
          str(toolInput.customer_id)
        );
        return JSON.stringify(result);
      }

      // ── Jobs ───────────────────────────────────────────────
      case "search_jobs": {
        const filters: { search?: string; status?: string; category?: string } = {};
        if (toolInput.search) filters.search = str(toolInput.search);
        if (toolInput.status) filters.status = str(toolInput.status);
        if (toolInput.category) filters.category = str(toolInput.category);
        const results = await getJobs(
          filters as Parameters<typeof getJobs>[0]
        );
        return JSON.stringify(results);
      }
      case "get_job": {
        const result = await getJob(str(toolInput.id));
        return JSON.stringify(result ?? { error: "Job not found" });
      }
      case "get_job_categories": {
        const result = await getJobCategories();
        return JSON.stringify(result);
      }
      case "create_job": {
        const today = new Date().toISOString().split("T")[0];
        const result = await createJob({
          customer_id: str(toolInput.customer_id),
          vehicle_id: str(toolInput.vehicle_id) || null,
          status: (str(toolInput.status, "not_started") as "not_started"),
          category: str(toolInput.category),
          assigned_tech: str(toolInput.assigned_tech) || null,
          date_received: str(toolInput.date_received, today),
          date_finished: str(toolInput.date_finished) || null,
          notes: str(toolInput.notes),
        });
        return JSON.stringify(result);
      }
      case "update_job": {
        const currentJob = await getJob(str(toolInput.id));
        if (!currentJob) return JSON.stringify({ error: "Job not found" });
        const result = await updateJob(str(toolInput.id), {
          customer_id: str(toolInput.customer_id, currentJob.customer_id),
          vehicle_id: toolInput.vehicle_id !== undefined
            ? (str(toolInput.vehicle_id) || null)
            : (currentJob.vehicle_id ?? null),
          status: str(toolInput.status, currentJob.status) as "not_started",
          category: str(toolInput.category, currentJob.category ?? ""),
          assigned_tech: toolInput.assigned_tech !== undefined
            ? (str(toolInput.assigned_tech) || null)
            : (currentJob.assigned_tech ?? null),
          date_received: str(toolInput.date_received, currentJob.date_received),
          date_finished: toolInput.date_finished !== undefined
            ? (str(toolInput.date_finished) || null)
            : (currentJob.date_finished ?? null),
          notes: str(toolInput.notes, currentJob.notes ?? ""),
        });
        return JSON.stringify(result);
      }
      case "update_job_status": {
        const result = await updateJobStatus(
          str(toolInput.id),
          str(toolInput.status) as Parameters<typeof updateJobStatus>[1]
        );
        return JSON.stringify(result);
      }
      case "delete_job": {
        const result = await deleteJob(str(toolInput.id));
        return JSON.stringify(result);
      }

      // ── Job Line Items ─────────────────────────────────────
      case "create_line_item": {
        const result = await createLineItem({
          job_id: str(toolInput.job_id),
          type: str(toolInput.type, "labor") as "labor" | "part",
          description: str(toolInput.description),
          quantity: num(toolInput.quantity, 1)!,
          unit_cost: num(toolInput.unit_cost, 0)!,
          part_number: str(toolInput.part_number),
        });
        return JSON.stringify(result);
      }
      case "update_line_item": {
        // For line item updates, we need all fields — the server action validates them
        const result = await updateLineItem(str(toolInput.id), {
          job_id: str(toolInput.job_id),
          type: str(toolInput.type, "labor") as "labor" | "part",
          description: str(toolInput.description),
          quantity: num(toolInput.quantity, 1)!,
          unit_cost: num(toolInput.unit_cost, 0)!,
          part_number: str(toolInput.part_number),
        });
        return JSON.stringify(result);
      }
      case "delete_line_item": {
        const result = await deleteLineItem(
          str(toolInput.id),
          str(toolInput.job_id)
        );
        return JSON.stringify(result);
      }

      // ── Estimates ──────────────────────────────────────────
      case "create_estimate_from_job": {
        const result = await createEstimateFromJob(str(toolInput.job_id));
        return JSON.stringify(result);
      }
      case "get_estimate": {
        const result = await getEstimate(str(toolInput.id));
        return JSON.stringify(result ?? { error: "Estimate not found" });
      }
      case "get_estimate_for_job": {
        const result = await getEstimateForJob(str(toolInput.job_id));
        return JSON.stringify(result ?? { error: "No estimate found for this job" });
      }
      case "send_estimate": {
        const result = await sendEstimate(str(toolInput.id));
        return JSON.stringify(result);
      }
      case "create_estimate_line_item": {
        const result = await createEstimateLineItem({
          estimate_id: str(toolInput.estimate_id),
          type: str(toolInput.type, "labor") as "labor" | "part",
          description: str(toolInput.description),
          quantity: num(toolInput.quantity, 1)!,
          unit_cost: num(toolInput.unit_cost, 0)!,
          part_number: str(toolInput.part_number),
        });
        return JSON.stringify(result);
      }
      case "update_estimate_line_item": {
        const result = await updateEstimateLineItem(str(toolInput.id), {
          estimate_id: str(toolInput.estimate_id),
          type: str(toolInput.type, "labor") as "labor" | "part",
          description: str(toolInput.description),
          quantity: num(toolInput.quantity, 1)!,
          unit_cost: num(toolInput.unit_cost, 0)!,
          part_number: str(toolInput.part_number),
        });
        return JSON.stringify(result);
      }
      case "delete_estimate_line_item": {
        const result = await deleteEstimateLineItem(
          str(toolInput.id),
          str(toolInput.estimate_id)
        );
        return JSON.stringify(result);
      }

      // ── Invoices ───────────────────────────────────────────
      case "create_invoice_from_job": {
        const result = await createInvoiceFromJob(str(toolInput.job_id));
        return JSON.stringify(result);
      }
      case "get_invoice_for_job": {
        const result = await getInvoiceForJob(str(toolInput.job_id));
        return JSON.stringify(result ?? { error: "No invoice found for this job" });
      }

      // ── Team ───────────────────────────────────────────────
      case "get_technicians": {
        const result = await getTechnicians();
        return JSON.stringify(result);
      }
      case "get_team_members": {
        const result = await getTeamMembers();
        return JSON.stringify(result);
      }

      // ── Reports ────────────────────────────────────────────
      case "get_report_data": {
        const isAllTime = toolInput.is_all_time === true;
        const today = new Date().toISOString().split("T")[0];
        const result = await getReportData({
          from: str(toolInput.from, "2020-01-01"),
          to: str(toolInput.to, today),
          isAllTime,
        });
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return JSON.stringify({ error: message });
  }
}
