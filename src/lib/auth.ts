import { createClient } from "@/lib/supabase/server";

export async function requireManager(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile, error } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  if (error || !profile) return { ok: false, error: "Unauthorized" };
  if (profile.role === "tech") return { ok: false, error: "Forbidden" };

  return { ok: true, userId: user.id };
}

/**
 * Auth gate for actions techs are allowed to perform: parking check-in/out,
 * lockbox handoff, DVI inspections, day-to-day operational work. Manager
 * is implicitly allowed — only blocks unauthenticated and unknown roles.
 *
 * Use this for operational mutations. Reserve `requireManager()` for
 * financial actions (invoices, payments, refunds) and settings changes.
 */
export async function requireStaff(): Promise<
  { ok: true; userId: string; role: "manager" | "tech" } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile, error } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  if (error || !profile) return { ok: false, error: "Unauthorized" };
  if (profile.role !== "manager" && profile.role !== "tech") {
    return { ok: false, error: "Forbidden" };
  }

  return { ok: true, userId: user.id, role: profile.role as "manager" | "tech" };
}
