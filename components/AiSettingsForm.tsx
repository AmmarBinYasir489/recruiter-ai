"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { updateAiSettingsAction, testAiAction } from "@/app/admin/actions";
import { AI_PROVIDER_OPTIONS, defaultModelFor, type AiProvider } from "@/lib/ai/providers";

interface Props {
  provider: AiProvider;
  model: string;
  configuredProviders: AiProvider[];
}

export function AiSettingsForm({ provider, model, configuredProviders }: Props) {
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const providerInfo = AI_PROVIDER_OPTIONS.find((item) => item.id === selectedProvider)!;
  const hasSavedKey = configuredProviders.includes(selectedProvider);

  function changeProvider(value: string) {
    const next = value as AiProvider;
    setSelectedProvider(next);
    setSelectedModel(defaultModelFor(next));
    setTest(null);
  }

  async function onTest(formData: FormData) {
    setBusy(true);
    setTest(null);
    const result = await testAiAction(formData);
    setTest(result);
    setBusy(false);
  }

  async function onSave(formData: FormData) {
    setBusy(true);
    setTest(null);
    const result = await updateAiSettingsAction(formData);
    setTest("error" in result
      ? { ok: false, message: result.error || "Settings were not saved." }
      : { ok: true, message: "Active provider and model saved. Any entered key was verified and encrypted." });
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <form action={onSave} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ai-provider">Active provider</label>
              <select id="ai-provider" name="provider" value={selectedProvider} onChange={(event) => changeProvider(event.target.value)} className="input">
                {AI_PROVIDER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}{configuredProviders.includes(item.id) ? " · key saved" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ai-model">Model</label>
              <input id="ai-model" name="model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} list={`models-${selectedProvider}`} className="input" autoComplete="off" required />
              <datalist id={`models-${selectedProvider}`}>
                {providerInfo.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </datalist>
              <p className="mt-1.5 text-xs text-slate-500">Choose a suggestion or enter any model ID supported by this provider.</p>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="label mb-0" htmlFor="ai-api-key">{providerInfo.label} API key</label>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasSavedKey ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {hasSavedKey ? "Encrypted key saved" : "No saved key"}
              </span>
            </div>
            <input id="ai-api-key" name="apiKey" type="password" autoComplete="new-password" className="input mt-2" placeholder={hasSavedKey ? "Leave blank to keep the saved key" : "Paste provider API key"} />
          </div>

          {hasSavedKey && (
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input className="mt-0.5" type="checkbox" name="clearApiKey" value="1" />
              <span>Remove only the saved {providerInfo.label} key and use its server environment key, if configured.</span>
            </label>
          )}

          <button className="btn-primary" disabled={busy}>{busy ? "Working…" : "Save active AI model"}</button>
          {test && <p role="status" className={`text-sm ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>{test.message}</p>}
        </form>
      </Card>

      <Card>
        <h3 className="font-bold text-ink-900">Test before using</h3>
        <p className="mt-1 text-sm text-slate-500">Tests the provider and exact model shown above. A pasted test key is never stored.</p>
        <form action={onTest} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="provider" value={selectedProvider} />
          <input type="hidden" name="model" value={selectedModel} />
          <div>
            <label className="label" htmlFor="test-api-key">Temporary API key</label>
            <input id="test-api-key" name="apiKey" type="password" autoComplete="new-password" className="input" placeholder="Leave blank to use saved or environment key" />
          </div>
          <button className="btn-ghost" disabled={busy}>Test {providerInfo.label}</button>
        </form>
        <p className="mt-3 text-xs text-slate-400">Without a working key, CV parsing uses the local fallback and subjective tests remain ready for human review.</p>
      </Card>
    </div>
  );
}
