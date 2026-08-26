"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateWorkspace } from "@/components/candidate/CandidateWorkspace";
import { ActionFeedbackDialog } from "@/components/ActionFeedbackDialog";
import { decisionBadge, statusBadge } from "@/components/ui";
import {
  passSelectedAction,
  rejectSelectedAction,
  offerSelectedAction,
  requestRetestsAction,
  sendBulkNotificationAction,
} from "@/app/recruiter/actions";

type AnyObj = Record<string, any>;

export function CandidateAccordion({ views }: { views: AnyObj[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const allIds = views.map((v) => v.application.id);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (s.length === allIds.length ? [] : allIds));

  async function runIssue() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await passSelectedAction(selected);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: "success", message: `${result.count} candidate${result.count === 1 ? "" : "s"} passed and moved to the next phase.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not issue the next phase." });
    } finally {
      setBusy(false);
    }
  }

  async function runReject() {
    if (!window.confirm(`Reject ${selected.length} selected candidate(s)?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await rejectSelectedAction(selected);
      if (result && "error" in result) throw new Error(String(result.error || "Could not reject the selected candidates."));
      setFeedback({ kind: "success", message: `${selected.length} candidate${selected.length === 1 ? "" : "s"} rejected.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not reject the selected candidates." });
    } finally {
      setBusy(false);
    }
  }

  async function runOffer() {
    if (!window.confirm(`Mark ${selected.length} selected candidate(s) as offered?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await offerSelectedAction(selected);
      if (result && "error" in result) throw new Error(String(result.error || "Could not update the selected candidates."));
      setFeedback({ kind: "success", message: `${selected.length} candidate${selected.length === 1 ? "" : "s"} marked as offered.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not update the selected candidates." });
    } finally {
      setBusy(false);
    }
  }

  async function runRetest() {
    if (!window.confirm(`Reissue the current completed assessment for ${selected.length} selected candidate(s)?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestRetestsAction(selected);
      if ("error" in result) throw new Error(String(result.error || "Could not reissue the selected tests."));
      setFeedback({ kind: "success", message: `${result.count} retest${result.count === 1 ? "" : "s"} prepared. Timers start when candidates begin.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not reissue the selected tests." });
    } finally {
      setBusy(false);
    }
  }

  async function runNotify() {
    if (!message.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendBulkNotificationAction(selected, message);
      if ("error" in result) throw new Error(String(result.error || "Could not send the notification."));
      setFeedback({ kind: "success", message: `Notification sent to ${result.count} candidate${result.count === 1 ? "" : "s"}.` });
      setMessage("");
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not send the notification." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
      <Card2>
        <table className="w-full min-w-0 max-w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allIds.length > 0 && selected.length === allIds.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-3 w-[20%]">Candidate</th>
              <th className="p-3 w-[17%]">Drive</th>
              <th className="p-3 w-[12%]">Stage</th>
              <th className="p-3 w-[12%]">CV</th>
              <th className="p-3 w-[10%]">CCAT</th>
              <th className="p-3 w-[10%]">MTT</th>
              <th className="p-3 w-[14%]">Status</th>
            </tr>
          </thead>
          <tbody>
            {views.map((v) => {
              const id = v.application.id;
              const open = openId === id;
              const scores = v.application.scores || {};
              const isSel = selected.includes(id);
              return (
                <Fragment key={id}>
                  <tr className={`border-b border-slate-50 hover:bg-slate-50 ${open ? "bg-slate-50" : ""} ${isSel ? "bg-brand-50/60" : ""}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${v.candidate.name}`}
                        checked={isSel}
                        onChange={() => toggle(id)}
                      />
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setOpenId(open ? null : id)}
                        className="font-semibold text-brand-700 hover:underline text-left"
                      >
                        {v.candidate.name}
                      </button>
                      <div className="text-xs text-slate-400">{v.candidate.email}</div>
                    </td>
                    <td className="p-3 text-slate-600">{v.application.driveName}</td>
                    <td className="p-3">{v.application.currentStage || "—"}</td>
                    <td className="p-3">{v.application.cvScore ?? "—"} {v.application.cvResult && decisionBadge(v.application.cvResult)}</td>
                    <td className="p-3">{scores.CCAT ?? "—"}</td>
                    <td className="p-3">{scores.MTT ?? "—"}</td>
                    <td className="p-3">{statusBadge(v.application.status)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={8} className="p-0 w-full min-w-0 max-w-0 overflow-hidden">
                        <div className="p-4 bg-slate-50/60 min-w-0">
                          <CandidateWorkspace view={v} expanded onToggleExpand={() => setOpenId(null)} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {views.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">No candidates match the filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card2>

      {selected.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-white p-3 shadow-lg" aria-label="Bulk candidate actions">
          <span className="text-sm font-semibold text-ink-900">{selected.length} selected</span>
          <button className="btn-primary whitespace-nowrap" disabled={busy} onClick={runIssue}>Pass &amp; move next</button>
          <button className="btn-outline whitespace-nowrap" disabled={busy} onClick={runOffer}>Offer</button>
          <button className="btn-outline whitespace-nowrap" disabled={busy} onClick={runRetest}>Reissue current test</button>
          <button className="btn-danger whitespace-nowrap" disabled={busy} onClick={runReject}>Reject</button>
          <input className="input min-w-52 flex-1" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message selected candidates" aria-label="Bulk notification message" />
          <button className="btn-outline whitespace-nowrap" disabled={busy || !message.trim()} onClick={runNotify}>Send notification</button>
          <button className="btn-ghost whitespace-nowrap" disabled={busy} onClick={() => setSelected([])}>Clear</button>
        </div>
      )}
    </>
  );
}

// Local lightweight card wrapper (avoids importing the server Card with padding).
function Card2({ children }: { children: React.ReactNode }) {
  return <div className="card w-full min-w-0 max-w-full overflow-hidden p-0">{children}</div>;
}
