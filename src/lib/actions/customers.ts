"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { customerSchema, prepareCustomerData, formatPhoneForStorage } from "@/lib/validators/customer";
import { revalidatePath } from "next/cache";
import type { CustomerFormData } from "@/lib/validators/customer";

const PAGE_SIZE = 50;

export async function getCustomers(search?: string, customerType?: string, page = 1) {
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, first_name, last_name, phone, email, customer_type, fleet_account", { count: "exact" })
    .order("last_name", { ascending: true });

  if (search) {
    const words = search.trim().split(/\s+/);
    if (words.length > 1) {
      // Multi-word: match first word against first_name AND last word against last_name
      const first = words[0];
      const last = words[words.length - 1];
      query = query.or(
        `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),phone.ilike.%${search}%,email.ilike.%${search}%`
      );
    } else {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      );
    }
  }

  if (customerType && customerType !== "all") {
    query = query.eq("customer_type", customerType as "retail" | "fleet" | "parking");
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);
  return { data: data ?? [], totalCount: count ?? 0 };
}

export async function searchCustomersForPicker(
  query: string,
  options?: { limit?: number; includeIds?: string[] }
) {
  const supabase = await createClient();
  const limit = options?.limit ?? 20;
  const includeIds = options?.includeIds?.filter(Boolean) ?? [];

  let q = supabase
    .from("customers")
    .select("id, first_name, last_name, phone")
    .order("last_name")
    .limit(limit);

  const trimmed = query.trim();
  if (trimmed) {
    const words = trimmed.split(/\s+/);
    if (words.length > 1) {
      q = q
        .ilike("first_name", `%${words[0]}%`)
        .ilike("last_name", `%${words.slice(1).join(" ")}%`);
    } else {
      q = q.or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`
      );
    }
  }

  const { data } = await q;
  const results = data ?? [];

  if (includeIds.length === 0) return results;

  const missing = includeIds.filter((id) => !results.some((r) => r.id === id));
  if (missing.length === 0) return results;

  const { data: pinned } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone")
    .in("id", missing);

  return [...(pinned ?? []), ...results];
}

export const getCustomer = cache(async (id: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
});

export type CustomerFieldPatch = Partial<{
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  customer_type: "retail" | "fleet" | "parking";
  fleet_account: string | null;
}>;

const EDITABLE_CUSTOMER_KEYS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address",
  "notes",
  "customer_type",
  "fleet_account",
] as const satisfies readonly (keyof CustomerFieldPatch)[];

export async function updateCustomerFields(id: string, patch: CustomerFieldPatch) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE_CUSTOMER_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (key === "phone") {
      update[key] = raw ? formatPhoneForStorage(String(raw)) : null;
      continue;
    }
    update[key] = typeof raw === "string" && raw.trim() === "" ? null : raw;
  }

  if (Object.keys(update).length === 0) return { error: "Nothing to update" };

  if ("first_name" in update && !update.first_name) return { error: "First name is required" };
  if ("last_name" in update && !update.last_name) return { error: "Last name is required" };

  const { error } = await supabase.from("customers").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createCustomer(formData: CustomerFormData) {
  const parsed = customerSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert(prepareCustomerData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { data };
}

export async function updateCustomer(id: string, formData: CustomerFormData) {
  const parsed = customerSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(prepareCustomerData(parsed.data))
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/dashboard");
  return { data };
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();

  // Check for active jobs
  const { count } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id)
    .in("status", ["not_started", "waiting_for_parts", "in_progress"]);

  if (count && count > 0) {
    return { error: "Cannot delete customer with active jobs" };
  }

  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { success: true };
}
