"use server";

import { createClient } from "@/lib/supabase/server";
import { vehicleSchema, prepareVehicleData } from "@/lib/validators/vehicle";
import { revalidatePath } from "next/cache";
import type { VehicleFormData } from "@/lib/validators/vehicle";

export async function getVehiclesByCustomer(customerId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customerId)
    .order("year", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getVehicle(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createVehicle(formData: VehicleFormData) {
  const parsed = vehicleSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert(prepareVehicleData(parsed.data))
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { data };
}

export async function updateVehicle(id: string, formData: VehicleFormData) {
  const parsed = vehicleSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update(prepareVehicleData(parsed.data))
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { data };
}

export async function deleteVehicle(id: string, customerId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("vehicles").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}
