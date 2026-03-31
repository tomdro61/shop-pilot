import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time endpoint to create Supabase Auth accounts for existing techs
// POST /api/admin/link-tech-auth { email, password }
export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find the user by email
  const { data: user, error: findErr } = await admin
    .from("users")
    .select("id, name, email, auth_id, role")
    .eq("email", email)
    .single();

  if (findErr || !user) {
    return NextResponse.json({ error: `User not found: ${email}` }, { status: 404 });
  }

  if (user.auth_id) {
    return NextResponse.json({ error: `${user.name} already has an auth account` }, { status: 400 });
  }

  // Create Supabase Auth account
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  // Link auth_id to existing user
  const { error: updateErr } = await admin
    .from("users")
    .update({ auth_id: authData.user.id })
    .eq("id", user.id);

  if (updateErr) {
    // Rollback auth account
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    name: user.name,
    email: user.email,
    message: `Auth account created and linked for ${user.name}`,
  });
}
