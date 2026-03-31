"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamMemberCreateSchema, teamMemberUpdateSchema } from "@/lib/validators/team";
import { revalidatePath } from "next/cache";
import type { TeamMemberCreateData, TeamMemberUpdateData } from "@/lib/validators/team";

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

export async function createTeamMember(formData: TeamMemberCreateData) {
  const parsed = teamMemberCreateSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { name, email, role, password } = parsed.data;
  const admin = createAdminClient();

  // 1. Create Supabase Auth account
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Skip email verification — manager is creating the account
  });

  if (authError) {
    return { error: authError.message };
  }

  // 2. Insert users table row with auth_id linked
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .insert({ name, email, role, auth_id: authData.user.id })
    .select()
    .single();

  if (error) {
    // Rollback: delete the auth account if users insert fails
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: error.message };
  }

  revalidatePath("/team");
  return { data };
}

export async function updateTeamMember(id: string, formData: TeamMemberUpdateData) {
  const parsed = teamMemberUpdateSchema.safeParse(formData);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role })
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/team");
  return { data };
}

export async function deleteTeamMember(id: string) {
  const supabase = await createClient();

  // Fetch the user to get their auth_id before deleting
  const { data: user } = await supabase
    .from("users")
    .select("auth_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("users").delete().eq("id", id);

  if (error) return { error: error.message };

  // Delete the Supabase Auth account if it exists
  if (user?.auth_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(user.auth_id);
  }

  revalidatePath("/team");
  revalidatePath("/jobs");
  return { success: true };
}
