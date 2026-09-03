"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";
import { getSupabaseAuth } from "@/lib/supabase/authServer";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";
import { linkSupabaseIdentity } from "@/lib/accounts";
import { allowAuthRequest } from "@/lib/authRateLimit";
import { verifyBotCheck } from "@/lib/botProtection";
import { authDestination } from "@/lib/authDestination";
import { staffMfaRequired } from "@/lib/staffMfa";

export type LoginState = {
  error: string;
  invalidCredentials?: boolean;
};

const EMPTY_LOGIN_STATE: LoginState = { error: "" };

async function authenticate(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Email and password are required.", invalidCredentials: true };

  let user;
  try {
    if (email.length > 254 || password.length > 256) return { error: "The email or password is incorrect.", invalidCredentials: true };
    if (!(await allowAuthRequest(email, "login"))) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again." };
    if (!(await verifyBotCheck(formData.get("cf-turnstile-response"), "login"))) return { error: "Please complete the security check and try again." };
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    console.error("[auth:login] user lookup failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  if (!user || ((!useSupabaseAuth() || !user.authId) && !(await verifyPassword(password, user.passwordHash)))) {
    console.warn("[auth:login] credentials rejected", { accountFound: Boolean(user) });
    return { error: "The email or password is incorrect.", invalidCredentials: true };
  }
  try {
    if (useSupabaseAuth()) {
      const authId = await linkSupabaseIdentity(user, password);
      const supabase = await getSupabaseAuth();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || data.user?.id !== authId) return { error: "The email or password is incorrect.", invalidCredentials: true };
    } else await createSession(user.id);
  } catch (error) {
    console.error("[auth:login] session creation failed", { userId: user.id, role: user.role, error: error instanceof Error ? error.message : String(error) });
    return { error: "Your account was verified, but the session could not be created. Please try again." };
  }
  console.info("[auth:login] session created", { userId: user.id, role: user.role });
  redirect(staffMfaRequired(user.role) ? "/security/mfa" : await authDestination(user, formData.get("returnTo")));
}

export async function loginFormAction(_previousState: LoginState, formData: FormData) {
  return authenticate(formData);
}

export async function loginAction(formData: FormData) {
  return authenticate(formData);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
