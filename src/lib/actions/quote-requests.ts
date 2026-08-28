"use server";

import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { QuoteRequestStatus } from "@/types";

export async function getQuoteRequests(filters?: {
  status?: QuoteRequestStatus;
  search?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.search) {
    const s = filters.search.toLowerCase();
    query = query.or(
      `first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,vehicle_make.ilike.%${s}%,vehicle_model.ilike.%${s}%,license_plate.ilike.%${s}%,vehicle_vin.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getQuoteRequest(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function getNewQuoteRequestCount() {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) return 0;
  return count || 0;
}

export async function updateQuoteRequestStatus(id: string, status: QuoteRequestStatus) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  // count, not just error: PostgREST reports error: null when an UPDATE matches
  // zero rows, so a deleted or bogus id would otherwise read as a successful
  // flip and leave the lead sitting on the New list.
  const { error, count } = await supabase
    .from("quote_requests")
    .update({ status, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id);

  if (error) return { error: error.message };
  if (count !== 1) {
    return { error: "That quote request no longer exists — it may have been deleted." };
  }

  revalidatePath("/quote-requests");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteQuoteRequest(id: string) {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("quote_requests")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/quote-requests");
  revalidatePath("/dashboard");
  return { success: true };
}
