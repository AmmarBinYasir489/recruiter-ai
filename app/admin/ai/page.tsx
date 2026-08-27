import { prisma } from "@/lib/db";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { configuredAiProviders, environmentModelFor, hasAiEnvironmentKey } from "@/lib/ai/config";
import { defaultModelFor, normalizeAiProvider } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export default async function AdminAi() {
  const settings = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  const provider = normalizeAiProvider(settings?.provider);
  const configuredProviders = configuredAiProviders(settings);
  if (hasAiEnvironmentKey(provider) && !configuredProviders.includes(provider)) configuredProviders.push(provider);
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900 mb-2">AI model settings</h1>
      <p className="text-slate-500 mb-6">Select an approved model, store the provider key safely, and test before enabling AI scoring/OCR.</p>
      <AiSettingsForm provider={provider} model={settings?.model || environmentModelFor(provider) || defaultModelFor(provider)} configuredProviders={configuredProviders} />
    </div>
  );
}
