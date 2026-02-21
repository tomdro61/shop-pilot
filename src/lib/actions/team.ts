"use server";

import { createClient } from "@/lib/supabase/server";
import { teamMemberSchema } from "@/lib/validators/team";
import { revalidatePath } from "next/cache";
import type { TeamMemberFormData } from "@/lib/validators/team";

export async function getTeamMembers() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getTechnicians() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "tech")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function createTeamMember(formData: TeamMemberFormData) {
  const parsed = teamMemberSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/team");
  return { data };
}

export async function updateTeamMember(id: string, formData: TeamMemberFormData) {
  const parsed = teamMemberSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/team");
  return { data };
}

export async function deleteTeamMember(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("users").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/team");
  revalidatePath("/jobs");
  return { success: true };
}
