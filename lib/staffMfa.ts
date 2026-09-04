import { getSupabaseAuth } from "@/lib/supabase/authServer";

export function staffMfaRequired(role: string) {
  return ["admin", "recruiter", "reviewer"].includes(role)
    && (process.env.NODE_ENV === "production" || process.env.STAFF_MFA_REQUIRED === "true");
}

export async function hasStaffMfa() {
  const auth = await getSupabaseAuth();
  // getAuthenticatorAssuranceLevel() without a JWT reads session.user from
  // cookie storage internally. Supabase deliberately warns that this user
  // object is not authenticated. getClaims() verifies the token first (using
  // the project's JWKS when available) and exposes the current AAL directly.
  const { data, error } = await auth.auth.getClaims();
  return !error && data?.claims?.aal === "aal2";
}
