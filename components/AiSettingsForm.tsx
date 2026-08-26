"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { updateAiSettingsAction, testAiAction } from "@/app/admin/actions";

export function AiSettingsForm({ provider, hasApiKey }: { provider: string; hasApiKey: boolean }) {
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onTest(formData: FormData) {
    setBusy(true);
    setTest(null);
    const r = await testAiAction(formData);
    setTest(r);
    setBusy(false);
  }

  async function onSave(formData: FormData) {
    setBusy(true);
    setTest(null);
    const result = await updateAiSettingsAction(formData);
    setTest("error" in result ? { ok: false, message: result.error || "Settings were not saved." } : { ok: true, message: "Settings saved and the new key was verified." });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <form action={onSave} className="space-y-3">
          <div>
            <label className="label">Provider</label>
            <select name="provider" defaultValue={provider} className="input">
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </div>
          <div>
            <label className="label">API key</label>
            <input name="apiKey" type="password" autoComplete="new-password" className="input" placeholder={hasApiKey ? "Saved securely — enter only to replace" : "Paste provider key"} />
          </div>
          {hasApiKey && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="clearApiKey" value="1" /> Clear the saved key and use the server environment key</label>}
          <button className="btn-primary" disabled={busy}>Save settings</button>
          {test && <p role="status" className={`text-sm ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>{test.message}</p>}
        </form>
      </Card>

      <Card>
        <h3 className="font-bold text-ink-900 mb-3">Test connection</h3>
        <form action={onTest} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Provider</label>
            <select name="provider" defaultValue={provider} className="input">
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="label">API key</label>
            <input name="apiKey" type="password" autoComplete="new-password" className="input" placeholder="Leave blank to use saved key" />
          </div>
          <button className="btn-ghost" disabled={busy}>Test</button>
        </form>
        {test && (
          <div className={`mt-3 text-sm ${test.ok ? "text-emerald-600" : "text-rose-600"}`}>
            {test.ok ? "✓ " : "✕ "}{test.message}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">Without a key, CV parsing uses the local heuristic fallback.</p>
      </Card>
    </div>
  );
}
