"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";

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
    user = await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    console.error("[auth:login] user lookup failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    console.warn("[auth:login] credentials rejected", { accountFound: Boolean(user) });
    return { error: "The email or password is incorrect.", invalidCredentials: true };
  }
  try {
    await createSession(user.id);
  } catch (error) {
    console.error("[auth:login] session creation failed", { userId: user.id, role: user.role, error: error instanceof Error ? error.message : String(error) });
    return { error: "Your account was verified, but the session could not be created. Please try again." };
  }
  console.info("[auth:login] session created", { userId: user.id, role: user.role });
  redirect(`/${user.role}`);
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

