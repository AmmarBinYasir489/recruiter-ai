"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideCandidateAction, offerSelectedAction } from "@/app/recruiter/actions";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";

export function StaffDecisionControls({ applicationId, stage }: { applicationId: string; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"HOLD" | "PASS" | "FAIL" | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  async function decide(decision: "HOLD" | "PASS" | "FAIL") {
    if (decision === "FAIL" && !window.confirm("Fail this application and stop this assessment path?")) return;
    setBusy(true);
    setPendingDecision(decision);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      const result = stage === "FINAL" && decision === "PASS" ? await offerSelectedAction([applicationId]) : await decideCandidateAction(applicationId, decision, stage);
      setFeedback("error" in result ? { kind: "error", message: result.error || "Could not save decision." } : { kind: "success", message: decision === "PASS" ? (stage === "FINAL" ? "Final selection recorded. The candidate has been notified." : "Approved. The next configured assessment is released if assigned.") : `Decision saved: ${decision}.` });
      router.refresh();
    } catch { setFeedback({ kind: "error", message: "Could not save the decision. Please refresh and try again." }); }
    finally { setBusy(false); setPendingDecision(null); }
  }
  return <div className="mt-4 flex flex-wrap gap-2">
    {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
    <button type="button" className="btn-ghost" aria-busy={pendingDecision === "HOLD"} disabled={busy} onClick={() => decide("HOLD")}>{pendingDecision === "HOLD" ? "Holding…" : "Hold"}</button>
    <button type="button" className="btn-primary" aria-busy={pendingDecision === "PASS"} disabled={busy} onClick={() => { if (stage !== "FINAL" || window.confirm("Record the final selection for this candidate?")) decide("PASS"); }}>{pendingDecision === "PASS" ? "Saving…" : stage === "FINAL" ? "Select candidate" : "Pass"}</button>
    <button type="button" className="btn-danger" aria-busy={pendingDecision === "FAIL"} disabled={busy} onClick={() => decide("FAIL")}>{pendingDecision === "FAIL" ? "Failing…" : "Fail"}</button>
  </div>;
}
