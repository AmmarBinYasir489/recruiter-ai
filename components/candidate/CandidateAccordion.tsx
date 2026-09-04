"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateWorkspace } from "@/components/candidate/CandidateWorkspace";
import { ActionFeedbackDialog } from "@/components/ActionFeedbackDialog";
import { decisionBadge, statusBadge } from "@/components/ui";
import {
  passSelectedAction,
  holdSelectedAction,
  rejectSelectedAction,
  offerSelectedAction,
  requestRetestsAction,
  sendBulkNotificationAction,
  assignSelectedFunnelAction,
  assignOnsiteFunnelAction,
  sendOnsiteInvitesAction,
} from "@/app/recruiter/actions";

type AnyObj = Record<string, any>;

export function CandidateAccordion({ views, initialApplicationId }: { views: AnyObj[]; initialApplicationId?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [openId, setOpenId] = useState<string | null>(() => initialApplicationId && views.some((view) => view.application.id === initialApplicationId) ? initialApplicationId : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
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
  const inFlight = useRef(new Set<string>());
  const detailControllers = useRef(new Map<string, AbortController>());

  const summaryVersion = useMemo(
    () => views.map((view) => [view.application.id, view.application.status, view.application.currentStage, view.application.cvScore, view.application.refreshKey, JSON.stringify(view.application.scores)].join(":" )).join("|"),
    [views],
  );
  const loadDetail = useCallback(async (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    const controller = new AbortController();
    detailControllers.current.set(id, controller);
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setDetailLoading(id);
    setDetailError((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/recruiter/candidates/${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 404 ? "Candidate is no longer available." : "Could not load candidate details.");
      const data = await response.json();
      setDetailViews((current) => ({ ...current, [id]: data.view }));
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Candidate details took too long to load. Retry the request."
        : error instanceof Error ? error.message : "Could not load candidate details.";
      setDetailError((current) => ({ ...current, [id]: message }));
    } finally {
      window.clearTimeout(timeout);
      detailControllers.current.delete(id);
      inFlight.current.delete(id);
      setDetailLoading((current) => current === id ? null : current);
    }
  }, []);

  useEffect(() => () => {
    detailControllers.current.forEach((controller) => controller.abort());
    detailControllers.current.clear();
  }, []);

  useEffect(() => {
    if (openId) void loadDetail(activeTrackByRow[openId] || openId);
  }, [summaryVersion, openId, activeTrackByRow, loadDetail]);

  useEffect(() => {
    if (initialApplicationId) setOpenId(initialApplicationId);
  }, [initialApplicationId]);

  // Refresh on focus. The list's watermark refresh already reloads details
  // whenever candidate state changes; a second five-second detail poll doubled
  // authenticated traffic and could continually restart slow requests.
  useEffect(() => {
    if (!openId) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && !busy) void loadDetail(activeTrackByRow[openId] || openId);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [openId, activeTrackByRow, busy, loadDetail]);

  const terminalStatuses = new Set(["ARCHIVED", "REJECTED", "OFFERED", "HIRED"]);
  const allIds = views.filter((view) => !terminalStatuses.has(view.application.status)).map((view) => view.application.id);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected((s) => (s.length === allIds.length ? [] : allIds));
  const selectedViews = views.filter((view) => selected.includes(view.application.id));
  const selectedApplicationIds = selected.map((rowId) => activeTrackByRow[rowId] || rowId);
  const selectedTrackViews = selected.map((rowId) => {
    const trackId = activeTrackByRow[rowId] || rowId;
    return detailViews[trackId] || views.find((view) => view.application.id === rowId);
  }).filter(Boolean);
  const selectedDriveIds = new Set(selectedViews.map((view) => view.application.driveId));
  const selectedTracksMutable = selectedTrackViews.length > 0 && selectedTrackViews.every((view) => !terminalStatuses.has(view.application.status));
  const canBulkAssign = selectedViews.length > 0 && selectedTracksMutable && selectedDriveIds.size === 1 && selectedViews.every((view) => view.application.cvScore != null && !["PROCESSING", "FAILED"].includes(view.application.cvResult));
  const funnelOptions = canBulkAssign ? (selectedViews[0]?.funnelOptions || []) : [];
  const validBulkFunnel = funnelOptions.some((funnel: AnyObj) => funnel.id === bulkFunnelId);
  const allSelectedAssigned = selectedTracksMutable && selectedTrackViews.every((view) => view.application.funnelId);
  const canMoveNext = selectedTracksMutable && selectedTrackViews.every((view) => view.application.funnelId && !["ONSITE", "FINAL"].includes(view.application.currentStage));
  const canIssueTest = selectedTracksMutable && selectedTrackViews.every((view) => view.application.funnelId);
  const validBulkRetest = bulkTestMode === "ONSITE" || selectedTrackViews.every((view) => view.application.currentStage === bulkTestType);
  const canInviteOnsite = selectedTracksMutable && selectedTrackViews.every((view) => view.application.currentStage === "ONSITE");

  async function beginAction(label: string) {
    setBusy(true);
    setPendingLabel(label);
    setFeedback(null);
    // Yield one frame so the pending state is painted before the server action
    // starts serializing and making remote database requests.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function finishAction() {
    setBusy(false);
    setPendingLabel("");
  }

  async function runIssue() {
    await beginAction(`Passing ${selected.length} candidate${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await passSelectedAction(selectedApplicationIds);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: "success", message: `${result.count} candidate${result.count === 1 ? "" : "s"} passed; their next assessment was approved.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not issue the next phase." });
    } finally {
      finishAction();
    }
  }

  async function runHold() {
    await beginAction(`Holding ${selected.length} candidate${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await holdSelectedAction(selectedApplicationIds);
      if ("error" in result) throw new Error(result.error || "Could not save decision.");
      setFeedback({ kind: "success", message: `${result.count} candidates held.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not hold candidates." });
    } finally {
      finishAction();
    }
  }

  async function runReject() {
    if (!window.confirm(`Reject ${selected.length} selected candidate(s)?`)) return;
    await beginAction(`Failing ${selected.length} candidate${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await rejectSelectedAction(selectedApplicationIds);
      if (result && "error" in result) throw new Error(String(result.error || "Could not reject the selected candidates."));
      setFeedback({ kind: "success", message: `${selected.length} candidate${selected.length === 1 ? "" : "s"} rejected.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not reject the selected candidates." });
    } finally {
      finishAction();
    }
  }

  async function runOffer() {
    if (!window.confirm(`Mark ${selected.length} selected candidate(s) as offered?`)) return;
    await beginAction(`Marking ${selected.length} candidate${selected.length === 1 ? "" : "s"} as offered…`);
    try {
      const result = await offerSelectedAction(selectedApplicationIds);
      if (result && "error" in result) throw new Error(String(result.error || "Could not update the selected candidates."));
      setFeedback({ kind: "success", message: `${selected.length} candidate${selected.length === 1 ? "" : "s"} marked as offered.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not update the selected candidates." });
    } finally {
      finishAction();
    }
  }

  async function runRetest() {
    if (bulkTestMode === "ONSITE") {
      if (!validBulkFunnel) return;
      await beginAction(`Assigning ${selected.length} onsite funnel${selected.length === 1 ? "" : "s"}…`);
      try {
        const result = await assignOnsiteFunnelAction(selectedApplicationIds, bulkFunnelId);
        if ("error" in result) throw new Error(result.error);
        setFeedback({ kind: "success", message: `${result.count} onsite funnel session(s) assigned. All enabled tests will run in sequence; online results remain unchanged.` });
        setSelected([]);
        router.refresh();
      } catch (error) {
        setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not assign onsite sessions." });
      } finally { finishAction(); }
      return;
    }
    if (!window.confirm(`Issue ${bulkTestType} in ${bulkTestMode.toLowerCase()} mode for ${selected.length} selected candidate(s)? Previous results are preserved. The new submission will wait for a staff decision.`)) return;
    await beginAction(`Preparing ${selected.length} ${bulkTestType} test${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await requestRetestsAction(selectedApplicationIds, bulkTestType, bulkTestMode);
      if ("error" in result) throw new Error(String(result.error || "Could not reissue the selected tests."));
      setFeedback({ kind: "success", message: `${result.count} ${bulkTestMode.toLowerCase()} test${result.count === 1 ? "" : "s"} prepared. Timers start when candidates begin.` });
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not reissue the selected tests." });
    } finally {
      finishAction();
    }
  }

  async function runNotify() {
    if (!message.trim()) return;
    await beginAction(`Sending ${selected.length} notification${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await sendBulkNotificationAction(selectedApplicationIds, message);
      if ("error" in result) throw new Error(String(result.error || "Could not send the notification."));
      setFeedback({ kind: "success", message: `Notification sent to ${result.count} candidate${result.count === 1 ? "" : "s"}.` });
      setMessage("");
      setSelected([]);
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not send the notification." });
    } finally {
      finishAction();
    }
  }

  async function runAssignFunnel(mode: "ADD" | "MOVE") {
    if (!validBulkFunnel) return;
    await beginAction(`${mode === "MOVE" ? "Moving" : "Assigning"} ${selected.length} candidate${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await assignSelectedFunnelAction(selectedApplicationIds, bulkFunnelId, mode);
      if ("error" in result) throw new Error(result.error);
      setFeedback({
        kind: "success",
        message: mode === "MOVE"
          ? `${result.count} candidate${result.count === 1 ? "" : "s"} moved. Previous tracks remain staff-only history.`
          : `${result.count} candidate${result.count === 1 ? "" : "s"} assigned an additional funnel track.`,
      });
      setSelected([]);
      setBulkFunnelId("");
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not assign the selected candidates." });
    } finally {
      finishAction();
    }
  }

  async function runOnsiteInvites() {
    if (!onsiteDate) return;
    await beginAction(`Preparing ${selected.length} onsite invitation${selected.length === 1 ? "" : "s"}…`);
    try {
      const result = await sendOnsiteInvitesAction(selectedApplicationIds, { scheduledAt: new Date(onsiteDate).toISOString(), location: onsiteLocation });
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
      finishAction();
    }
  }

  return (
    <div data-auto-refresh-pause={busy ? "true" : undefined}>
      {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
      <Card2>
        <table className="candidate-table w-full min-w-0 max-w-full table-fixed text-sm tabular-nums">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  disabled={!ready || busy}
                  checked={allIds.length > 0 && selected.length === allIds.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-3 w-[19%]">Candidate</th>
              <th className="p-3 w-[16%]">Drive</th>
              <th className="p-3 w-[10%]">Stage</th>
              <th className="p-3 w-[9%]">CV</th>
              <th className="p-3 w-[7%]">CCAT</th>
              <th className="p-3 w-[7%]">MTT</th>
              <th className="p-3 w-[14%]">Total /100</th>
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
              const isTerminal = terminalStatuses.has(v.application.status);
              return (
                <Fragment key={id}>
                  <tr className={`border-b border-slate-50 hover:bg-slate-50 ${open ? "bg-slate-50" : ""} ${isSel ? "bg-brand-50/60" : ""}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${v.candidate.name}`}
                        disabled={!ready || busy || isTerminal}
                        checked={isSel}
                        onChange={() => toggle(id)}
                        title={isTerminal ? "Terminal applications cannot be changed with bulk actions." : undefined}
                      />
                    </td>
                    <td className="p-3">
                      <button
                        aria-expanded={open}
                        disabled={!ready}
                        onClick={() => setOpenId(open ? null : id)}
                        className="font-semibold text-brand-700 hover:underline text-left"
                      >
                        {v.candidate.name}
                      </button>
                      <div className="break-words text-xs text-slate-400">{v.candidate.email}</div>
                      {v.application.trackCount > 1 && <div className="mt-1 text-xs font-medium text-brand-700">{v.application.trackCount} funnel tracks</div>}
                    </td>
                    <td data-label="Drive" className="p-3 text-slate-600">
                      <div>{v.application.driveName}</div>
                      <div className="text-xs font-medium text-brand-700">{v.application.funnelName || "Applicant pool"}</div>
                    </td>
                    <td data-label="Current phase" className="p-3">{v.application.currentStage || "—"}</td>
                    <td data-label="CV" className="p-3">{v.application.cvScore ?? "—"} {v.application.cvResult && decisionBadge(v.application.cvResult)}</td>
                    <td data-label="CCAT" className="p-3">{scores.CCAT ?? "—"}</td>
                    <td data-label="MTT" className="p-3">{scores.MTT ?? "—"}</td>
                    <td data-label="Total" className="p-3"><span className="font-semibold">{v.application.overall?.total ?? 0}/100</span><p className="text-xs text-slate-500">{v.application.overall?.gradedCount ?? 0}/{v.application.overall?.assessmentCount ?? 0} graded{!v.application.overall?.complete ? " · provisional" : ""}</p></td>
                    <td data-label="Status" className="p-3">{busy && isSel ? <span className="badge-info">Updating…</span> : statusBadge(v.application.status)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className="p-0 w-full min-w-0 max-w-0 overflow-hidden">
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
                                onUpdated={() => loadDetail(activeTrackId)}
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
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">No candidates match the filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card2>

      {selected.length > 0 && (
        <div className="md:sticky md:bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-white p-3 shadow-lg" aria-label="Bulk candidate actions">
          <span className="text-sm font-semibold text-ink-900">{selected.length} selected</span>
          {busy && <span role="status" aria-live="polite" className="badge-info">{pendingLabel || "Processing…"}</span>}
          {!selectedTracksMutable && <span className="text-xs font-medium text-amber-700">Historical funnel tracks are read-only. Select an active track to use bulk actions.</span>}
          {canBulkAssign && <>
            <select className="input min-w-52" aria-label="Funnel for selected applicants" value={bulkFunnelId} onChange={(event) => setBulkFunnelId(event.target.value)}>
              <option value="">Choose funnel</option>
              {funnelOptions.map((funnel: AnyObj) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
            </select>
            {allSelectedAssigned ? (
              <>
                <button className="btn-primary whitespace-nowrap" disabled={busy || !validBulkFunnel} onClick={() => runAssignFunnel("ADD")}>Add another funnel</button>
                <button className="btn-outline whitespace-nowrap" disabled={busy || !validBulkFunnel} onClick={() => runAssignFunnel("MOVE")}>Move to funnel</button>
              </>
            ) : (
              <button className="btn-primary whitespace-nowrap" disabled={busy || !validBulkFunnel} onClick={() => runAssignFunnel("ADD")}>Assign funnel &amp; release test</button>
            )}
          </>}
          {canBulkAssign && funnelOptions.length === 0 && <span className="text-xs text-amber-700">Create and publish a funnel for this drive before assigning applicants.</span>}
          {selectedViews.length > 0 && !canBulkAssign && <span className="text-xs text-amber-700">Funnel assignment requires screened applicants from the same drive.</span>}
          <button className="btn-ghost whitespace-nowrap" aria-busy={busy && pendingLabel.startsWith("Holding")} disabled={busy || !selectedTracksMutable} onClick={runHold}>{busy && pendingLabel.startsWith("Holding") ? "Holding…" : "Hold"}</button>
          <button className="btn-primary whitespace-nowrap" aria-busy={busy && pendingLabel.startsWith("Passing")} disabled={busy || !selectedTracksMutable} onClick={runIssue}>{busy && pendingLabel.startsWith("Passing") ? "Passing…" : "Pass"}</button>
          {canInviteOnsite && <>
            <input type="datetime-local" className="input min-w-52" aria-label="Onsite screening date and time" value={onsiteDate} onChange={(event) => setOnsiteDate(event.target.value)} />
            <input className="input min-w-48" aria-label="Onsite screening location" placeholder="Onsite location" value={onsiteLocation} onChange={(event) => setOnsiteLocation(event.target.value)} />
            <button className="btn-primary whitespace-nowrap" disabled={busy || !onsiteDate} onClick={runOnsiteInvites}>Send onsite invitations</button>
          </>}
          <button className="btn-outline whitespace-nowrap" disabled={busy || !selectedTracksMutable || !selectedTrackViews.every((view) => view.application.currentStage === "FINAL")} onClick={runOffer}>Offer</button>
          {canIssueTest && <>
            {bulkTestMode === "ONLINE" && <select className="input min-w-40" aria-label="Bulk assessment type" value={bulkTestType} onChange={(event) => setBulkTestType(event.target.value)}>
              <option value="CCAT">CCAT / IQ</option>
              <option value="MTT">Math Thinking</option>
              <option value="CODING">Coding</option>
              <option value="ESSAY">Essay</option>
              <option value="PROMPT">Prompt Engineering</option>
              <option value="GAMES">Games</option>
            </select>}
            <select className="input min-w-40" aria-label="Bulk test delivery mode" value={bulkTestMode} onChange={(event) => setBulkTestMode(event.target.value as "ONLINE" | "ONSITE")}>
              <option value="ONLINE">Test: Online</option>
              <option value="ONSITE">Onsite: Full funnel</option>
            </select>
            <button className="btn-outline whitespace-nowrap" disabled={busy || (bulkTestMode === "ONSITE" ? !canBulkAssign || !validBulkFunnel : !validBulkRetest)} onClick={runRetest}>
              {bulkTestMode === "ONSITE" ? "Assign onsite funnel" : "Reissue current online test"}
            </button>
            {bulkTestMode === "ONSITE" && <p className="w-full text-sm text-slate-600">Choose the funnel above. A separate onsite session runs every enabled test in order, then waits for staff review. Existing online progress and scores are preserved.</p>}
            {!validBulkRetest && <span className="text-xs text-amber-700">Online reissue must match every selected track’s current stage.</span>}
          </>}
          <button className="btn-danger whitespace-nowrap" aria-busy={busy && pendingLabel.startsWith("Failing")} disabled={busy || !selectedTracksMutable} onClick={runReject}>{busy && pendingLabel.startsWith("Failing") ? "Failing…" : "Fail"}</button>
          <input className="input min-w-52 flex-1" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message selected candidates" aria-label="Bulk notification message" disabled={!selectedTracksMutable} />
          <button className="btn-outline whitespace-nowrap" disabled={busy || !selectedTracksMutable || !message.trim()} onClick={runNotify}>Send notification</button>
          <button className="btn-ghost whitespace-nowrap" disabled={busy} onClick={() => setSelected([])}>Clear</button>
        </div>
      )}
    </div>
  );
}

// Local lightweight card wrapper (avoids importing the server Card with padding).
function Card2({ children }: { children: React.ReactNode }) {
  return <div className="card w-full min-w-0 max-w-full overflow-hidden p-0">{children}</div>;
}
