"use server";

import { redirect } from "next/navigation";
import { prisma, j } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { testProvider } from "@/lib/ai/parseCv";
import { encryptAiKey, getAiRuntimeConfig } from "@/lib/ai/config";
import { revalidatePath } from "next/cache";

export async function createUserAction(formData: FormData) {
  const user = await requireRole("admin");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "candidate");
  const password = String(formData.get("password") || "");
  if (!email || !name) return { error: "Name and email required." };
  if (!["admin", "recruiter", "reviewer", "candidate"].includes(role)) return { error: "Invalid role." };
  if (password.length < 12) return { error: "Password must be at least 12 characters." };
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Email already exists." };
  await prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "USER_CREATED", meta: j({ email, role }) } });
  return { ok: true };
}

export async function updateAiSettingsAction(formData: FormData) {
  const user = await requireRole("admin");
  const provider = String(formData.get("provider") || "gemini") === "groq" ? "groq" : "gemini";
  const apiKey = String(formData.get("apiKey") || "").trim();
  const existing = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  const storedKey = apiKey ? encryptAiKey(apiKey) : existing?.apiKey || "";
  await prisma.aiSetting.upsert({
    where: { id: "singleton" },
    update: { provider, apiKey: storedKey },
    create: { id: "singleton", provider, apiKey: storedKey },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "AI_SETTINGS", meta: j({ provider }) } });
  return { ok: true };
}

export async function testAiAction(formData: FormData) {
  await requireRole("admin");
  const provider = String(formData.get("provider") || "gemini") === "groq" ? "groq" : "gemini";
  const entered = String(formData.get("apiKey") || "").trim();
  const runtime = await getAiRuntimeConfig(provider);
  return testProvider(provider, entered || runtime.apiKey);
}

export async function upsertUniversityTierAction(formData: FormData) {
  const user = await requireRole("admin");
  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const tier = Math.max(1, Math.min(3, Math.round(Number(formData.get("tier") || 3))));
  const score = Math.max(0, Math.min(100, Math.round(Number(formData.get("score") || 70))));
  if (!name) return { error: "University name is required." };
  if (id) {
    await prisma.universityTier.update({ where: { id }, data: { name, tier, score } });
  } else {
    await prisma.universityTier.create({ data: { name, tier, score } });
  }
  await prisma.auditLog.create({ data: { actorId: user.id, action: "UNIVERSITY_TIER_UPDATED", meta: j({ id: id || undefined, name, tier, score }) } });
  revalidatePath("/admin/tiers");
  return { ok: true };
}
