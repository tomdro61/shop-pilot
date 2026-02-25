"use server";

import { createClient } from "@/lib/supabase/server";
import { shopSettingsSchema } from "@/lib/validators/settings";
import { revalidatePath } from "next/cache";
import type { ShopSettings, ShopSettingsUpdate } from "@/types";

export async function getShopSettings(): Promise<ShopSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_settings")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("Failed to fetch shop settings:", error.message);
    return null;
  }
  return data;
}

export async function updateShopSettings(
  updates: ShopSettingsUpdate
): Promise<{ data?: ShopSettings; error?: string }> {
  // Validate
  const parsed = shopSettingsSchema.partial().safeParse(updates);
  if (!parsed.success) {
    return { error: "Invalid settings data" };
  }

  const supabase = await createClient();

  // Get the single row's id
  const { data: existing, error: fetchError } = await supabase
    .from("shop_settings")
    .select("id")
    .limit(1)
    .single();

  if (fetchError || !existing) {
    return { error: "Settings not found" };
  }

  const { data, error } = await supabase
    .from("shop_settings")
    .update(parsed.data)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/rates");
  revalidatePath("/jobs");
  revalidatePath("/estimates");

  return { data };
}
