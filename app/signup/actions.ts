"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, getCurrentUser } from "@/lib/auth";
import { allowAuthRequest } from "@/lib/authRateLimit";
import { createPortalAccount } from "@/lib/accounts";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";
import { getSupabaseAuth } from "@/lib/supabase/authServer";
import { verifyBotCheck } from "@/lib/botProtection";
import { registrationCredentials } from "@/lib/registration";
import { candidatePlaceholderName, signedInDestination } from "@/lib/publicApplications";
import { authDestination } from "@/lib/authDestination";

export type SignupState = { error: string; field?: "email" | "password" };

export async function signupAction(_state: SignupState, data: FormData): Promise<SignupState> {
  const current = await getCurrentUser();
  if (current) redirect(signedInDestination(current.role, data.get("returnTo")));
  const parsed = registrationCredentials.safeParse({ email: data.get("email"), password: data.get("password") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.message, field: issue.path[0] === "email" ? "email" : "password" };
  }
  const { email, password } = parsed.data;
  let userId: string;
  try {
    if (!(await allowAuthRequest(email, "signup"))) return { error: "Too many signup attempts. Please wait 15 minutes and try again." };
    if (!(await verifyBotCheck(data.get("cf-turnstile-response"), "signup"))) return { error: "Please complete the security check and try again." };
    const user = await createPortalAccount({
      // No form-provided role, name, verification status or funnel is trusted.
      email, password, name: candidatePlaceholderName(email), role: "candidate",
    });
    userId = user.id;
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return { error: "An account could not be created with this email. If you already registered, sign in.", field: "email" };
    }
    console.error("[auth:signup] registration unavailable");
    return { error: "Signup is temporarily unavailable. Please try again shortly." };
  }
  try {
    if (useSupabaseAuth()) {
      const supabase = await getSupabaseAuth();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else await createSession(userId);
  } catch {
    return { error: "Your account was created, but automatic sign-in failed. Please sign in with your new password." };
  }
  revalidatePath("/admin/users");
  redirect(await authDestination({ id: userId, role: "candidate" }, data.get("returnTo")));
}
