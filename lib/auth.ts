import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { getSupabaseAuth } from "./supabase/authServer";
import { useSupabaseAuth } from "./supabase/authConfig";
import { redirect } from "next/navigation";
import { hasStaffMfa, staffMfaRequired } from "./staffMfa";

const SESSION_COOKIE = "rp_session";
const SESSION_DAYS = 7;

function sessionDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string): Promise<string> {
  if (useSupabaseAuth()) throw new Error("Supabase sign-in is required.");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  // Only a one-way digest is stored, so a database read cannot be turned into
  // an authenticated browser session.
  await prisma.session.create({ data: { token: sessionDigest(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  if (useSupabaseAuth()) {
    const supabase = await getSupabaseAuth();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Sign-out could not be completed. Please retry.");
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token: { in: [sessionDigest(token), token] } } });
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getCurrentUser(options: { allowMfaSetup?: boolean } = {}): Promise<SessionUser | null> {
  if (useSupabaseAuth()) {
    const supabase = await getSupabaseAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    // Never link by email or trust user-editable JWT metadata for staff access.
    const user = await prisma.user.findUnique({
      where: { authId: data.user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    // Central enforcement protects both page reads and action/API writes.
    // Only the dedicated MFA setup actions/page may use the setup exception.
    if (user && !options.allowMfaSetup && staffMfaRequired(user.role) && !(await hasStaffMfa())) redirect("/security/mfa");
    return user;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const digest = sessionDigest(token);
  let session = await prisma.session.findUnique({
    where: { token: digest },
    include: { user: true },
  });
  // Seamlessly migrate sessions created before token hashing was introduced.
  if (!session) {
    const legacy = await prisma.session.findUnique({ where: { token }, include: { user: true } });
    if (legacy) {
      session = await prisma.session.update({ where: { id: legacy.id }, data: { token: digest }, include: { user: true } });
    }
  }
  if (!session || session.expiresAt < new Date()) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) throw new Error("FORBIDDEN");
  return u;
}
