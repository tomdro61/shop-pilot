"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { customerSchema, prepareCustomerData } from "@/lib/validators/customer";
import { revalidatePath } from "next/cache";
import type { CustomerFormData } from "@/lib/validators/customer";

export async function getCustomers(search?: string, customerType?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, first_name, last_name, phone, email, customer_type, fleet_account")
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
    query = query.eq("customer_type", customerType as "retail" | "fleet");
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data;
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
  return { success: true };
}
