import { getSupabaseAuth } from "@/lib/supabase/authServer";

export function staffMfaRequired(role: string) {
  return ["admin", "recruiter", "reviewer"].includes(role)
    && (process.env.NODE_ENV === "production" || process.env.STAFF_MFA_REQUIRED === "true");
}

export async function hasStaffMfa() {
  const auth = await getSupabaseAuth();
  const { data, error } = await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.currentLevel === "aal2";
}
