"use client";

import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, decisionBadge } from "@/components/ui";
import { previewPhaseThresholdAction, applyPhaseThresholdAction } from "@/app/recruiter/actions";

export function PhaseThresholdEditor({
  funnelId,
  phaseType,
  phaseLabel,
  currentThreshold,
}: {
  funnelId: string;
  phaseType: string;
  phaseLabel: string;
  currentThreshold: number;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [saved, setSaved] = useState("");
  const [proposed, setProposed] = useState(currentThreshold);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPreview() {
    setBusy(true);
    setError(null);
    try {
      const p = await previewPhaseThresholdAction(funnelId, phaseType, Number(proposed));
      setPreview(p);
    } catch (e: any) {
      setError(e?.message || "Failed to preview");
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    setBusy(true);
    setError(null);
    try {
      const r = await applyPhaseThresholdAction(funnelId, phaseType, Number(proposed), preview.currentThreshold);
      if (r?.error) {
        setError(r.error);
        return;
      }
      const message = `Threshold saved: ${proposed}%. Qualifying waiting candidates have been approved; others remain on Hold. Progressed candidates are unchanged.`;
      setSaved(message);
      setFeedback({ kind: "success", message });
      setPreview(null);
      router.refresh();
    } catch (e: any) {
      if (e?.message && e.message !== "NEXT_REDIRECT") setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
      {saved && <p role="status" className="text-sm text-emerald-700 my-3">{saved}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs uppercase text-slate-500">{phaseLabel} — pass threshold</div>
          <div className="text-2xl font-black text-ink-900">{currentThreshold}</div>
        </div>
        <div className="text-2xl text-slate-300">→</div>
        <div>
          <label className="label">New threshold</label>
          <input
            aria-label="New pass threshold"
            type="number"
            min={0}
            max={100}
            value={proposed}
            onChange={(e) => { setProposed(Number(e.target.value)); setPreview(null); }}
            className="input w-28"
          />
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2">Editing alone changes nothing. Preview the impact before applying. This affects only this funnel&apos;s {phaseLabel} phase.</p>
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost" onClick={onPreview} disabled={busy || !Number.isFinite(proposed) || proposed < 0 || proposed > 100}>Preview impact</button>
        <button className="btn-ghost" onClick={() => { setProposed(currentThreshold); setPreview(null); }}>Cancel</button>
      </div>

      {error && <Card className="border-rose-200 bg-rose-50 text-rose-700 text-sm mt-3">{error}</Card>}

      {preview && (
        <Card className="mt-3">
          <h4 className="font-bold text-ink-900 mb-2">Threshold change preview (read-only)</h4>
          <p className="text-sm text-slate-500 mb-2">{preview.currentThreshold} → {preview.proposedThreshold}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="stat"><span className="text-xs uppercase text-slate-500">Eligible</span><span className="text-xl font-bold">{preview.eligible}</span></div>
            <div className="stat"><span className="text-xs uppercase text-slate-500">Remain on Hold</span><span className="text-xl font-bold text-rose-600">{preview.holding}</span></div>
            <div className="stat"><span className="text-xs uppercase text-slate-500">Pass & release next</span><span className="text-xl font-bold text-emerald-600">{preview.passing}</span></div>
          </div>
          <div className="max-h-40 overflow-auto text-xs space-y-1 mb-3">
            {preview.details.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between border-b border-slate-100 py-1">
                <span className="text-slate-500">{d.id.slice(0, 8)} · score {d.cvScore}</span>
                <span className="flex items-center gap-2">{decisionBadge(d.oldResult)} → {decisionBadge(d.newResult)}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mb-2">Confirm approves qualifying waiting candidates and releases their next assessment. Others remain on Hold. Progressed candidates are unchanged.</p>
          <button className="btn-primary" onClick={onApply} disabled={busy}>Confirm &amp; Apply</button>
        </Card>
      )}
    </div>
  );
}
