"use server";

import { redirect } from "next/navigation";
import { prisma, j } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { testAiProvider } from "@/lib/ai/client";
import { encryptAiKey, getAiRuntimeConfig, parseStoredProviderChecks, parseStoredProviderKeys } from "@/lib/ai/config";
import { normalizeAiModel, normalizeAiProvider } from "@/lib/ai/providers";
import { revalidatePath } from "next/cache";
import { canCreateStaffRole, registrationCredentials } from "@/lib/registration";
import { createPortalAccount } from "@/lib/accounts";

export async function createUserAction(formData: FormData) {
  const user = await requireRole("admin");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "");
  const password = String(formData.get("password") || "");
  if (!email || !name) return { error: "Name and email required." };
  if (!canCreateStaffRole(role)) return { error: "Admins can create recruiter and reviewer accounts only. Candidates must sign up themselves." };
  const valid = registrationCredentials.safeParse({ email, password });
  if (!valid.success) return { error: valid.error.issues[0].message };
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Email already exists." };
  try { await createPortalAccount({ email, name, password, role: role as "recruiter" | "reviewer" }); }
  catch { return { error: "Account could not be created. Check whether the email is already registered or contact support." }; }
  await prisma.auditLog.create({ data: { actorId: user.id, action: "USER_CREATED", meta: j({ email, role }) } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateAiSettingsAction(formData: FormData) {
  const user = await requireRole("admin");
  const provider = normalizeAiProvider(formData.get("provider"));
  let model: string;
  try { model = normalizeAiModel(provider, formData.get("model")); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid model ID." }; }
  const apiKey = String(formData.get("apiKey") || "").trim();
  const existing = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  const clearApiKey = formData.get("clearApiKey") === "1";
  let keyTest: Awaited<ReturnType<typeof testAiProvider>> | null = null;
  if (apiKey) {
    keyTest = await testAiProvider({ provider, model, apiKey, fallbackApiKey: "" });
    if (!keyTest.ok) return { error: `Key was not saved: ${keyTest.message}` };
  }
  const providerKeys = parseStoredProviderKeys(existing?.providerKeys);
  const providerChecks = parseStoredProviderChecks(existing?.providerChecks);
  if (existing?.apiKey && !providerKeys[normalizeAiProvider(existing.provider)]) {
    providerKeys[normalizeAiProvider(existing.provider)] = existing.apiKey;
  }
  if (clearApiKey) delete providerKeys[provider];
  else if (apiKey) providerKeys[provider] = encryptAiKey(apiKey);
  if (clearApiKey) delete providerChecks[provider];
  else if (keyTest?.ok) providerChecks[provider] = { status: "WORKING", model, checkedAt: new Date().toISOString() };
  else if (existing?.provider === provider && existing.model !== model) delete providerChecks[provider];
  await prisma.aiSetting.upsert({
    where: { id: "singleton" },
    update: { provider, model, providerKeys: JSON.stringify(providerKeys), providerChecks: JSON.stringify(providerChecks), apiKey: "" },
    create: { id: "singleton", provider, model, providerKeys: JSON.stringify(providerKeys), providerChecks: JSON.stringify(providerChecks), apiKey: "" },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, action: "AI_SETTINGS", meta: j({ provider, model, keyChanged: Boolean(apiKey || clearApiKey) }) } });
  revalidatePath("/admin/ai");
  return { ok: true };
}

export async function testAiAction(formData: FormData) {
  const user = await requireRole("admin");
  const provider = normalizeAiProvider(formData.get("provider"));
  let model: string;
  try { model = normalizeAiModel(provider, formData.get("model")); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Invalid model ID." }; }
  const entered = String(formData.get("apiKey") || "").trim();
  const runtime = await getAiRuntimeConfig(provider, model);
  const result = await testAiProvider({ ...runtime, apiKey: entered || runtime.apiKey, fallbackApiKey: entered ? "" : runtime.fallbackApiKey });
  // A temporary test key is intentionally never persisted and must not change the saved provider's health status.
  if (!entered && runtime.apiKey) {
    const existing = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
    const providerChecks = parseStoredProviderChecks(existing?.providerChecks);
    providerChecks[provider] = { status: result.ok ? "WORKING" : "FAILED", model, checkedAt: new Date().toISOString() };
    await prisma.aiSetting.upsert({
      where: { id: "singleton" },
      update: { providerChecks: JSON.stringify(providerChecks) },
      create: { id: "singleton", provider, model, providerChecks: JSON.stringify(providerChecks) },
    });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "AI_PROVIDER_TESTED", meta: j({ provider, model, ok: result.ok }) } });
    revalidatePath("/admin/ai");
  }
  return result;
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
