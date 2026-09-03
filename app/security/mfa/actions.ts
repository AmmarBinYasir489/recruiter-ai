"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAuth } from "@/lib/supabase/authServer";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";
import { consumeAuthLimit } from "@/lib/authRateLimit";
import { signedInDestination } from "@/lib/publicApplications";

export type MfaState = { error: string; factorId?: string; qr?: string; secret?: string };

async function mfaContext() {
  const user = await getCurrentUser({ allowMfaSetup: true });
  if (!user || !["admin", "recruiter", "reviewer"].includes(user.role) || !useSupabaseAuth()) throw new Error("FORBIDDEN");
  return { user, supabase: await getSupabaseAuth() };
}

export async function enrollMfa(): Promise<MfaState> {
  try {
    const { user, supabase } = await mfaContext();
    if (!(await consumeAuthLimit(`mfa:enroll:${user.id}`, 5))) return { error: "Too many setup attempts. Try again in 15 minutes." };
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) throw listed.error;
    const verified = listed.data.totp.find(factor => factor.status === "verified");
    if (verified) return { error: "An authenticator is already configured. Enter its code.", factorId: verified.id };
    // Remove only incomplete enrollments owned by this authenticated user.
    // Verified factors can never be replaced from an AAL1 session here.
    for (const factor of listed.data.all.filter(factor => factor.factor_type === "totp" && factor.status === "unverified")) {
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) throw removed.error;
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Recruitment Portal" });
    if (error || !data) throw error;
    return { error: "", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  } catch { return { error: "Authenticator setup is unavailable. Please retry or contact your administrator." }; }
}

export async function verifyMfa(form: FormData): Promise<MfaState> {
  let destination: string;
  try {
    const { user, supabase } = await mfaContext();
    if (!(await consumeAuthLimit(`mfa:verify:${user.id}`, 10))) return { error: "Too many verification attempts. Try again in 15 minutes." };
    const code = String(form.get("code") || "").trim();
    const factorId = String(form.get("factorId") || "");
    if (!/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from your authenticator." };
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error || !factors.data.all.some(factor => factor.id === factorId && factor.factor_type === "totp")) return { error: "Authenticator setup changed. Reload this page." };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { error: "That code is invalid or expired. Enter a new code." };
    destination = signedInDestination(user.role, null);
  } catch { return { error: "Verification is unavailable. Please retry." }; }
  redirect(destination);
}
