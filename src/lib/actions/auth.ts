"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SignInErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "missing_fields"
  | "unknown";

function codeForSupabaseError(message: string): SignInErrorCode {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "invalid_credentials";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (m.includes("rate limit")) return "rate_limited";
  return "unknown";
}

export async function signIn(formData: FormData) {
  const email = (formData.get("email") as string | null) ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  let errorCode: SignInErrorCode | null = null;
  let role: string | null = null;

  if (!email || !password) {
    errorCode = "missing_fields";
  } else {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        errorCode = codeForSupabaseError(error.message);
      } else if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("role")
          .eq("auth_id", data.user.id)
          .single();

        if (profileError) {
          // Profile lookup failed — log but don't block sign-in. Default to
          // manager dashboard; middleware will re-check role on the next request.
          console.error("signIn profile lookup failed", profileError);
        }
        role = profile?.role ?? null;
      }
    } catch (e) {
      console.error("signIn unexpected error", e);
      errorCode = "unknown";
    }
  }

  if (errorCode) {
    const params = new URLSearchParams({ error: errorCode, email });
    redirect(`/login?${params.toString()}`);
  }

  if (role === "tech") {
    redirect("/dvi");
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  return profile;
});
