"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import type { ActionResult } from "./_types";

export interface Task {
  id: string;
  title: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  user_id: string | null;
}

export async function getOpenTasks(): Promise<Task[]> {
  // Tasks are the manager's personal scratchpad. Techs share the dashboard
  // route, so a missing-manager response returns an empty list rather than
  // crashing — the empty state is the intended UX for non-manager viewers.
  const auth = await requireManager();
  if (!auth.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, created_at, resolved_at, user_id")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);
  return (data ?? []) as Task[];
}

export async function createTask(title: string): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: "Task title is required" };
  if (trimmed.length > 500) return { ok: false, error: "Task title is too long" };

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", auth.userId)
    .single();
  if (profileError || !profile) {
    return { ok: false, error: profileError?.message ?? "User profile not found" };
  }

  const { error } = await supabase.from("tasks").insert({
    title: trimmed,
    user_id: profile.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resolveTask(id: string): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Task not found" };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const auth = await requireManager();
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Task not found" };

  revalidatePath("/", "layout");
  return { ok: true };
}
