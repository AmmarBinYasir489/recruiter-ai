"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { updateAiSettingsAction, testAiAction } from "@/app/admin/actions";
import { AI_PROVIDER_OPTIONS, defaultModelFor, type AiProvider } from "@/lib/ai/providers";
import type { AiProviderState } from "@/lib/ai/config";

interface Props {
  provider: AiProvider;
  model: string;
  providerStates: Record<AiProvider, AiProviderState>;
}

const statusPresentation = {
  WORKING: { label: "Working", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAILED: { label: "Connection failed", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  UNTESTED: { label: "Configured · not tested", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  NOT_CONFIGURED: { label: "Not configured", className: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const;

const keySourceLabel = {
  STORED: "Encrypted database key",
  ENVIRONMENT: "Server environment key",
  STORED_AND_ENVIRONMENT: "Encrypted database key + environment fallback",
  NONE: "No key present",
} as const;

export function AiSettingsForm({ provider, model, providerStates }: Props) {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(provider);
  const [selectedModel, setSelectedModel] = useState(model);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const providerInfo = AI_PROVIDER_OPTIONS.find((item) => item.id === selectedProvider)!;
  const selectedState = providerStates[selectedProvider];

  function changeProvider(value: string) {
    const next = value as AiProvider;
    setSelectedProvider(next);
    setSelectedModel(providerStates[next].model || defaultModelFor(next));
    setFeedback(null);
  }

  async function onTest(formData: FormData) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await testAiAction(formData);
      setFeedback(result);
      router.refresh();
    } catch {
      setFeedback({ ok: false, message: "The provider test could not be completed." });
    } finally {
      setBusy(false);
    }
  }

  async function onSave(formData: FormData) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await updateAiSettingsAction(formData);
      setFeedback("error" in result
        ? { ok: false, message: result.error || "Settings were not saved." }
        : { ok: true, message: "Provider settings saved. Any entered key was tested and encrypted before database storage." });
      router.refresh();
    } catch {
      setFeedback({ ok: false, message: "Settings could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-bold text-ink-900">Provider health</h2>
            <p className="mt-1 text-sm text-slate-500">Saved connection state for every supported provider. Tests run only from the secured backend.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {AI_PROVIDER_OPTIONS.map((item) => {
              const state = providerStates[item.id];
              const status = statusPresentation[state.status];
              return (
                <div key={item.id} className={`rounded-xl border p-4 ${item.id === selectedProvider ? "border-primary-400 bg-primary-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">{item.label}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>{status.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{keySourceLabel[state.keySource]}</p>
                  {state.checkedAt && (
                    <p className="mt-1 text-xs text-slate-400">Checked {state.checkedAt.slice(0, 16).replace("T", " ")} UTC{state.model ? ` · ${state.model}` : ""}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <form action={onSave} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ai-provider">Active provider</label>
              <select id="ai-provider" name="provider" value={selectedProvider} onChange={(event) => changeProvider(event.target.value)} className="input">
                {AI_PROVIDER_OPTIONS.map((item) => {
                  const status = statusPresentation[providerStates[item.id].status].label;
                  return <option key={item.id} value={item.id}>{item.label} · {status}</option>;
                })}
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
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusPresentation[selectedState.status].className}`}>
                {statusPresentation[selectedState.status].label}
              </span>
            </div>
            <input id="ai-api-key" name="apiKey" type="password" autoComplete="new-password" spellCheck={false} className="input mt-2" placeholder={selectedState.configured ? "Leave blank to keep the existing key" : "Paste provider API key"} />
            <p className="mt-1.5 text-xs text-slate-500">{keySourceLabel[selectedState.keySource]}. Saved secrets are never displayed again.</p>
          </div>

          {selectedState.configured && (
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input className="mt-0.5" type="checkbox" name="clearApiKey" value="1" />
              <span>Remove the saved {providerInfo.label} key. A server environment fallback, if present, remains available.</span>
            </label>
          )}

          <button className="btn-primary" disabled={busy}>{busy ? "Working…" : "Save active AI model"}</button>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-bold text-ink-900">Test connection</h3>
            <p className="mt-1 text-sm text-slate-500">Leave the field empty to test the saved or environment key and update the provider status. Temporary test keys are never stored.</p>
          </div>
          <form action={onTest} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="provider" value={selectedProvider} />
            <input type="hidden" name="model" value={selectedModel} />
            <div>
              <label className="label" htmlFor="test-api-key">Temporary API key</label>
              <input id="test-api-key" name="apiKey" type="password" autoComplete="new-password" spellCheck={false} className="input" placeholder="Leave blank to use the configured key" />
            </div>
            <button className="btn-ghost" disabled={busy}>Test {providerInfo.label}</button>
          </form>
          {feedback && <p role="status" className={`text-sm ${feedback.ok ? "text-emerald-600" : "text-rose-600"}`}>{feedback.ok ? "✓ " : "✕ "}{feedback.message}</p>}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-2">
          <h3 className="font-bold text-ink-900">How API keys are protected</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Production HTTPS/TLS encrypts the key while it travels from this browser to the backend.</li>
            <li>The backend verifies a new key, then encrypts it with AES-256-GCM before writing it to Supabase.</li>
            <li>Stored keys and environment secrets are server-only and are never returned to candidate, recruiter, or admin browsers.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
