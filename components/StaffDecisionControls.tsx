"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideCandidateAction, offerSelectedAction } from "@/app/recruiter/actions";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";

export function StaffDecisionControls({ applicationId, stage }: { applicationId: string; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  async function decide(decision: "HOLD" | "PASS" | "FAIL") {
    if (decision === "FAIL" && !window.confirm("Fail this application and stop this assessment path?")) return;
    setBusy(true);
    try {
      const result = stage === "FINAL" && decision === "PASS" ? await offerSelectedAction([applicationId]) : await decideCandidateAction(applicationId, decision, stage);
      setFeedback("error" in result ? { kind: "error", message: result.error || "Could not save decision." } : { kind: "success", message: decision === "PASS" ? (stage === "FINAL" ? "Final selection recorded. The candidate has been notified." : "Approved. The next configured assessment is released if assigned.") : `Decision saved: ${decision}.` });
      router.refresh();
    } catch { setFeedback({ kind: "error", message: "Could not save the decision. Please refresh and try again." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 flex flex-wrap gap-2">
    {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
    <button type="button" className="btn-ghost" disabled={busy} onClick={() => decide("HOLD")}>Hold</button>
    <button type="button" className="btn-primary" disabled={busy} onClick={() => { if (stage !== "FINAL" || window.confirm("Record the final selection for this candidate?")) decide("PASS"); }}>{stage === "FINAL" ? "Select candidate" : "Pass"}</button>
    <button type="button" className="btn-danger" disabled={busy} onClick={() => decide("FAIL")}>Fail</button>
  </div>;
}
