"use server";

import { prisma } from "@/lib/db";
import { allowAuthRequest } from "@/lib/authRateLimit";
import { verifyBotCheck } from "@/lib/botProtection";
import { getSupabaseAuth } from "@/lib/supabase/authServer";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";
import { registrationCredentials } from "@/lib/registration";

export type RecoveryState = { error: string; message?: string; sent?: boolean; completed?: boolean };
const SENT = "If this email has a linked portal account, a recovery code has been sent. Check your inbox and spam folder.";

export async function requestRecovery(form: FormData): Promise<RecoveryState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!registrationCredentials.shape.email.safeParse(email).success) return { error: "Enter a valid email address." };
  try {
    if (!(await allowAuthRequest(email, "recovery"))) return { error: "Too many requests. Please try again in 15 minutes." };
    if (!(await verifyBotCheck(form.get("cf-turnstile-response"), "recovery"))) return { error: "Complete the security check and try again." };
    if (!useSupabaseAuth()) return { error: "Password recovery requires Supabase Auth." };
    // No automatic legacy-account linking or role assignment based on email.
    const user = await prisma.user.findUnique({ where: { email }, select: { authId: true } });
    if (user?.authId) {
      const supabase = await getSupabaseAuth();
      // Recovery email template must contain {{ .Token }}. Code entry avoids
      // token-bearing URLs, prefetch consumption and open redirect handling.
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) console.error("[auth:recovery] delivery failed", { code: error.code });
    }
    // Same response for absent, unlinked and delivery-failed accounts.
    return { error: "", message: SENT, sent: true };
  } catch { return { error: "Recovery is temporarily unavailable. Please retry shortly." }; }
}

export async function resetPassword(form: FormData): Promise<RecoveryState> {
  const parsed = registrationCredentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const code = String(form.get("code") || "").trim();
  if (!/^\d{6,10}$/.test(code)) return { error: "Enter the recovery code from your email." };
  if (form.get("password") !== form.get("confirmPassword")) return { error: "Passwords do not match." };
  try {
    if (!(await allowAuthRequest(parsed.data.email, "reset"))) return { error: "Too many attempts. Please try again in 15 minutes." };
    if (!(await verifyBotCheck(form.get("cf-turnstile-response"), "reset"))) return { error: "Complete the security check and try again." };
    if (!useSupabaseAuth()) return { error: "Password recovery requires Supabase Auth." };
    const supabase = await getSupabaseAuth();
    const verified = await supabase.auth.verifyOtp({ email: parsed.data.email, token: code, type: "recovery" });
    if (verified.error || !verified.data.user) return { error: "This recovery code is invalid, expired or already used. Request a new code." };
    const user = await prisma.user.findUnique({ where: { authId: verified.data.user.id }, select: { id: true } });
    if (!user) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Recovery could not be completed. Contact the recruitment team." };
    }
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const factor = factors.data.totp.find(item => item.status === "verified");
    if (factor) {
      const mfaCode = String(form.get("mfaCode") || "").trim();
      if (!/^\d{6}$/.test(mfaCode)) {
        await supabase.auth.signOut({ scope: "local" });
        return { error: "Your account requires an authenticator code. Request a new email code and enter both codes." };
      }
      const mfa = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: mfaCode });
      if (mfa.error) {
        await supabase.auth.signOut({ scope: "local" });
        return { error: "The authenticator code was invalid. Request a new email code and retry with both codes." };
      }
    }
    const updated = await supabase.auth.updateUser({ password: parsed.data.password });
    if (updated.error) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "The password could not be changed. Request a new code or contact your administrator if MFA is required." };
    }
    const signedOut = await supabase.auth.signOut({ scope: "global" });
    // Password remains owned by Supabase; never restore a local bcrypt fallback.
    if (signedOut.error) {
      console.error("[auth:recovery] session revocation failed");
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Your password changed, but other sessions could not be signed out. Contact your administrator.", completed: true };
    }
    return { error: "", message: "Password updated. Sign in with your new password.", completed: true };
  } catch { return { error: "Password recovery could not be completed. Please request a new code and retry." }; }
}
