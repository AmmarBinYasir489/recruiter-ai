import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";

export async function linkSupabaseIdentity(user: { id: string; email: string; authId: string | null }, password: string) {
  if (user.authId) return user.authId;
  const admin = getSupabaseAdmin();
  // Called for new accounts or only AFTER verifying a legacy password.
  // A pre-existing Supabase email is NOT accepted as proof of ownership.
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email, password, email_confirm: true,
    app_metadata: { portal_user_id: user.id },
  });
  if (error || !data.user) {
    console.error("[auth:provision] provider request failed", { code: error?.code, status: error?.status });
    throw new Error("Account setup could not be completed. Please contact the recruitment team if this continues.");
  }
  let linked = false;
  try {
    const changed = await prisma.user.updateMany({
      where: { id: user.id, authId: null },
      // Remove the old credential once Supabase owns password management.
      data: { authId: data.user.id, passwordHash: `supabase:${randomBytes(24).toString("hex")}` },
    });
    if (changed.count !== 1) throw new Error("Account setup changed. Please sign in again.");
    linked = true;
    return data.user.id;
  } finally {
    if (!linked) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
      if (cleanupError) console.error("[auth:provision] orphan identity requires cleanup", { authId: data.user.id });
    }
  }
}

export async function createPortalAccount(input: { email: string; name: string; password: string; role: "candidate" | "recruiter" | "reviewer" }) {
  const user = await prisma.user.create({ data: {
    email: input.email, name: input.name, role: input.role,
    passwordHash: useSupabaseAuth() ? "supabase:pending" : await hashPassword(input.password),
  } });
  try {
    if (useSupabaseAuth()) await linkSupabaseIdentity(user, input.password);
    return user;
  } catch (error) {
    // Delete only this newly-created, unlinked account, never an existing user.
    await prisma.user.deleteMany({ where: { id: user.id, authId: null } });
    throw error;
  }
}
