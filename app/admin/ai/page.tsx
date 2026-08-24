import { prisma } from "@/lib/db";
import { AiSettingsForm } from "@/components/AiSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminAi() {
  const settings = await prisma.aiSetting.findUnique({ where: { id: "singleton" } });
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink-900 mb-2">AI model settings</h1>
      <p className="text-slate-500 mb-6">Select an approved model, store the provider key safely, and test before enabling AI scoring/OCR.</p>
      <AiSettingsForm provider={settings?.provider || "gemini"} hasApiKey={Boolean(settings?.apiKey)} />
    </div>
  );
}
