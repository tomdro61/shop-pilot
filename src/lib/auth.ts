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
