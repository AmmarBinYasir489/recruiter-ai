import { getAiRuntimeConfig, parseStoredProviderChecks } from "@/lib/ai/config";
import { testProvider } from "@/lib/ai/parseCv";
import { gradeSubjective } from "@/lib/ai/gradeSubjective";
import { prisma } from "@/lib/db";

async function main() {
try {
  const config = await getAiRuntimeConfig();
  const connection = await testProvider(config.provider, config.apiKey, config.model);
  let statusPersisted = false;
  if (process.argv.includes("--persist-status") && config.apiKey) {
    const settings = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
    const checks = parseStoredProviderChecks(settings?.providerChecks);
    checks[config.provider] = { status: connection.ok ? "WORKING" : "FAILED", model: config.model, checkedAt: new Date().toISOString() };
    await prisma.aiSetting.upsert({
      where: { id: "singleton" },
      update: { providerChecks: JSON.stringify(checks) },
      create: { id: "singleton", provider: config.provider, model: config.model, providerChecks: JSON.stringify(checks) },
    });
    statusPersisted = true;
  }
  let grading: { ok: boolean; normalized?: number; error?: string } = { ok: false };
  try {
    const result = await gradeSubjective("ESSAY", [{ number: 1, prompt: "Explain why testing matters.", answer: "Testing identifies regressions and verifies that software behavior matches its requirements.", maxScore: 10 }]);
    grading = { ok: Boolean(result), normalized: result?.normalized };
  } catch (error) {
    grading = { ok: false, error: error instanceof Error ? error.message.slice(0, 240) : "unknown error" };
  }
  console.log(JSON.stringify({ provider: config.provider, model: config.model, keyConfigured: Boolean(config.apiKey), connection, grading, statusPersisted }));
} finally {
  await prisma.$disconnect();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
