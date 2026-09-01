"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateWorkspace } from "@/components/candidate/CandidateWorkspace";
import { ActionFeedbackDialog } from "@/components/ActionFeedbackDialog";
import { decisionBadge, statusBadge } from "@/components/ui";
import {
  advanceSelectedAction,
  rejectSelectedAction,
  offerSelectedAction,
  requestRetestsAction,
  sendBulkNotificationAction,
  assignSelectedFunnelAction,
  sendOnsiteInvitesAction,
} from "@/app/recruiter/actions";

type AnyObj = Record<string, any>;

export function CandidateAccordion({ views }: { views: AnyObj[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bulkFunnelId, setBulkFunnelId] = useState("");
  const [bulkTestMode, setBulkTestMode] = useState<"ONLINE" | "ONSITE">("ONLINE");
  const [bulkTestType, setBulkTestType] = useState("CCAT");
  const [onsiteDate, setOnsiteDate] = useState("");
  const [onsiteLocation, setOnsiteLocation] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [detailViews, setDetailViews] = useState<Record<string, AnyObj>>({});
  const [activeTrackByRow, setActiveTrackByRow] = useState<Record<string, string>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  const summaryVersion = useMemo(
    () => views.map((view) => [view.application.id, view.application.status, view.application.currentStage, view.application.cvScore, view.application.refreshKey, JSON.stringify(view.application.scores)].join(":" )).join("|"),
    [views],
  );
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(id);
    setDetailError((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/recruiter/candidates/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "Candidate is no longer available." : "Could not load candidate details.");
      const data = await response.json();
      setDetailViews((current) => ({ ...current, [id]: data.view }));
    } catch (error) {
      setDetailError((current) => ({ ...current, [id]: error instanceof Error ? error.message : "Could not load candidate details." }));
    } finally {
      setDetailLoading((current) => current === id ? null : current);
    }
  }, []);

  useEffect(() => {
    setDetailViews({});
    setActiveTrackByRow({});
    if (openId) void loadDetail(openId);
  }, [summaryVersion, openId, loadDetail]);

  const allIds = views.map((v) => v.application.id);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (s.length === allIds.length ? [] : allIds));
  const selectedViews = views.filter((view) => selected.includes(view.application.id));
  const selectedDriveIds = new Set(selectedViews.map((view) => view.application.driveId));
  const canBulkAssign = selectedViews.length > 0 && selectedDriveIds.size === 1 && selectedViews.every((view) => ["PASS", "FAIL"].includes(view.application.cvResult));
  const funnelOptions = canBulkAssign ? (selectedViews[0]?.funnelOptions || []) : [];
  const validBulkFunnel = funnelOptions.some((funnel: AnyObj) => funnel.id === bulkFunnelId);
  const canMoveNext = selectedViews.length > 0 && selectedViews.every((view) => view.application.funnelId && !["ONSITE", "FINAL"].includes(view.application.currentStage));
  const canIssueTest = selectedViews.length > 0 && selectedViews.every((view) => view.application.funnelId);
  const validBulkRetest = bulkTestMode === "ONSITE" || selectedViews.every((view) => view.application.currentStage === bulkTestType);
  const canInviteOnsite = selectedViews.length > 0 && selectedViews.every((view) => view.application.currentStage === "ONSITE");

  async function runIssue() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await advanceSelectedAction(selected);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: "success", message: `${result.count} candidate${result.count === 1 ? "" : "s"} moved to the next phase. No test result was changed.` });
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
    if (!window.confirm(`Issue ${bulkTestType} in ${bulkTestMode.toLowerCase()} mode for ${selected.length} selected candidate(s)? Their present funnel position will be restored after this additional attempt.`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestRetestsAction(selected, bulkTestType, bulkTestMode);
      if ("error" in result) throw new Error(String(result.error || "Could not reissue the selected tests."));
      setFeedback({ kind: "success", message: `${result.count} ${bulkTestMode.toLowerCase()} test${result.count === 1 ? "" : "s"} prepared. Timers start when candidates begin.` });
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

  async function runAssignFunnel() {
    if (!validBulkFunnel) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await assignSelectedFunnelAction(selected, bulkFunnelId);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: "success", message: `${result.count} candidate${result.count === 1 ? "" : "s"} assigned. Opening-time notifications were sent.` });
      setSelected([]);
      setBulkFunnelId("");
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not assign the selected candidates." });
    } finally {
      setBusy(false);
    }
  }

  async function runOnsiteInvites() {
    if (!onsiteDate) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendOnsiteInvitesAction(selected, { scheduledAt: new Date(onsiteDate).toISOString(), location: onsiteLocation });
      if ("error" in result) throw new Error(result.error);
      const warning = result.emailFailures ? ` ${result.emailFailures} email${result.emailFailures === 1 ? "" : "s"} failed, but portal notifications were saved.` : "";
      setFeedback({ kind: result.emailFailures ? "error" : "success", message: `${result.count} onsite invitation${result.count === 1 ? "" : "s"} prepared.${warning}` });
      setSelected([]);
      setOnsiteDate("");
      setOnsiteLocation("");
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not send onsite invitations." });
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
              const activeTrackId = activeTrackByRow[id] || id;
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
                      {v.application.trackCount > 1 && <div className="mt-1 text-xs font-medium text-brand-700">{v.application.trackCount} funnel tracks</div>}
                    </td>
                    <td className="p-3 text-slate-600">
                      <div>{v.application.driveName}</div>
                      <div className="text-xs font-medium text-brand-700">{v.application.funnelName || "Applicant pool"}</div>
                    </td>
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
                          {detailViews[activeTrackId]
                            ? <CandidateWorkspace
                                view={detailViews[activeTrackId]}
                                expanded
                                onToggleExpand={() => setOpenId(null)}
                                onSelectTrack={(trackId) => {
                                  setActiveTrackByRow((current) => ({ ...current, [id]: trackId }));
                                  if (!detailViews[trackId]) void loadDetail(trackId);
                                }}
                              />
                            : detailError[activeTrackId]
                              ? <div className="card text-sm text-rose-700">{detailError[activeTrackId]} <button type="button" className="ml-2 font-semibold underline" onClick={() => void loadDetail(activeTrackId)}>Retry</button></div>
                              : <div className="card text-sm text-slate-500" aria-live="polite">{detailLoading === activeTrackId ? "Loading secure candidate workspace…" : "Loading candidate workspace…"}</div>}
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
          {canBulkAssign && <>
            <select className="input min-w-52" aria-label="Funnel for selected applicants" value={bulkFunnelId} onChange={(event) => setBulkFunnelId(event.target.value)}>
              <option value="">Choose funnel</option>
              {funnelOptions.map((funnel: AnyObj) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
            </select>
            <button className="btn-primary whitespace-nowrap" disabled={busy || !validBulkFunnel} onClick={runAssignFunnel}>Assign funnel &amp; release test</button>
          </>}
          {canBulkAssign && funnelOptions.length === 0 && <span className="text-xs text-amber-700">Create and publish a funnel for this drive before assigning applicants.</span>}
          {selectedViews.length > 0 && !canBulkAssign && <span className="text-xs text-amber-700">Funnel assignment requires screened applicants from the same drive.</span>}
          {canMoveNext && <button className="btn-primary whitespace-nowrap" disabled={busy} onClick={runIssue}>Move to next stage</button>}
          {canInviteOnsite && <>
            <input type="datetime-local" className="input min-w-52" aria-label="Onsite screening date and time" value={onsiteDate} onChange={(event) => setOnsiteDate(event.target.value)} />
            <input className="input min-w-48" aria-label="Onsite screening location" placeholder="Onsite location" value={onsiteLocation} onChange={(event) => setOnsiteLocation(event.target.value)} />
            <button className="btn-primary whitespace-nowrap" disabled={busy || !onsiteDate} onClick={runOnsiteInvites}>Send onsite invitations</button>
          </>}
          <button className="btn-outline whitespace-nowrap" disabled={busy} onClick={runOffer}>Offer</button>
          {canIssueTest && <>
            <select className="input min-w-40" aria-label="Bulk assessment type" value={bulkTestType} onChange={(event) => setBulkTestType(event.target.value)}>
              <option value="CCAT">CCAT / IQ</option>
              <option value="MTT">Math Thinking</option>
              <option value="CODING">Coding</option>
              <option value="ESSAY">Essay</option>
              <option value="PROMPT">Prompt Engineering</option>
              <option value="GAMES">Games</option>
            </select>
            <select className="input min-w-40" aria-label="Bulk test delivery mode" value={bulkTestMode} onChange={(event) => setBulkTestMode(event.target.value as "ONLINE" | "ONSITE")}>
              <option value="ONLINE">Test: Online</option>
              <option value="ONSITE">Test: Onsite</option>
            </select>
            <button className="btn-outline whitespace-nowrap" disabled={busy || !validBulkRetest} onClick={runRetest}>
              {bulkTestMode === "ONSITE" ? "Issue onsite comparison" : "Reissue current online test"}
            </button>
            {!validBulkRetest && <span className="text-xs text-amber-700">Online reissue must match every selected track’s current stage.</span>}
          </>}
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
