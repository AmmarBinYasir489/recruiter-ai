"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decisionBadge } from "@/components/ui";
import { issueNextPhaseAction, passSelectedAction, rejectSelectedAction, offerSelectedAction } from "@/app/recruiter/actions";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";

export interface CohortRow {
  id: string;
  candidateName: string;
  score: number;
  result: string;
}

export function CohortView({
  funnelId,
  phaseType,
  phaseLabel,
  rows,
  initialSelected,
  automaticDecision = false,
}: {
  funnelId: string;
  phaseType: string;
  phaseLabel: string;
  rows: CohortRow[];
  initialSelected?: string[];
  automaticDecision?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initialSelected ?? []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  const allSelected = rows.length > 0 && selected.length === rows.length;

  async function run(fn: () => Promise<any>, label: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const r = await fn();
      if (r && "error" in r) throw new Error(String(r.error || "Action failed."));
      setFeedback({ kind: "success", message: `${label}: ${r?.count ?? "completed"}.` });
      setSelected([]);
      router.refresh();
    } catch (e: any) {
      setFeedback({ kind: "error", message: e?.message || "Action failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {!automaticDecision && <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => run(() => issueNextPhaseAction(funnelId, phaseType, [], "passing"), "Issued next phase to passing")}
        >
          Issue next phase → passing only
        </button>}
        {!automaticDecision && <button
          className="btn-primary"
          disabled={busy || selected.length === 0}
          onClick={() => run(() => passSelectedAction(selected), "Passed and moved")}
        >
          Pass &amp; move selected ({selected.length})
        </button>}
        {!automaticDecision && <button
          className="btn-ghost"
          disabled={busy || selected.length === 0}
          onClick={() => run(() => issueNextPhaseAction(funnelId, phaseType, selected, "selected"), "Issued next phase to selected")}
        >
          Issue next phase → selected ({selected.length})
        </button>}
        {automaticDecision && <span className="badge-info">Threshold and next-stage release are automatic</span>}
        <button className="btn-ghost" disabled={busy || selected.length === 0} onClick={() => run(() => rejectSelectedAction(selected), "Rejected")}>
          Reject selected
        </button>
        <button className="btn-ghost" disabled={busy || selected.length === 0} onClick={() => run(() => offerSelectedAction(selected), "Offered")}>
          Offer selected
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="p-2"><input type="checkbox" aria-label={`Select all ${phaseLabel} candidates`} checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} /></th>
              <th className="p-2">Candidate</th>
              <th className="p-2">Score</th>
              <th className="p-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-3 text-slate-400">No applications at this stage.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="p-2"><input type="checkbox" aria-label={`Select ${r.candidateName}`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2 font-semibold">{r.candidateName}</td>
                <td className="p-2">{r.score}</td>
                <td className="p-2">{decisionBadge(r.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
