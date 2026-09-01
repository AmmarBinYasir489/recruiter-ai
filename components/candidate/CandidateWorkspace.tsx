"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";
import {
  advanceApplicationAction,
  rejectApplicationAction,
  manualPassAction,
  requestRetestAction,
  sendNotificationAction,
  updateResultScoreAction,
  assignCandidateFunnelAction,
  sendOnsiteInviteAction,
} from "@/app/recruiter/actions";
import { CV_RUBRIC } from "@/lib/engine/cv";

type AnyObj = Record<string, any>;

function parse(s: any): any {
  if (s == null) return null;
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

type StageStatus = "PASSED" | "FAILED" | "PENDING" | "ACTIVE" | "NOT_REACHED";

const STATUS_STYLE: Record<StageStatus, { ring: string; text: string; label: string }> = {
  PASSED: { ring: "border-emerald-400 bg-emerald-50", text: "text-emerald-700", label: "Passed" },
  FAILED: { ring: "border-rose-400 bg-rose-50", text: "text-rose-700", label: "Failed" },
  PENDING: { ring: "border-amber-400 bg-amber-50", text: "text-amber-700", label: "Pending" },
  ACTIVE: { ring: "border-brand-400 bg-brand-50", text: "text-brand-700", label: "Active" },
  NOT_REACHED: { ring: "border-slate-200 bg-slate-50", text: "text-slate-400", label: "Not reached" },
};

function IntegrityBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="badge-muted">—</span>;
  const cls = level === "HONEST" ? "badge-pass" : level === "PLAGIARIST" ? "badge-fail" : "badge-pending";
  return <span className={cls}>{level}</span>;
}

function deriveStages(view: AnyObj) {
  const configured: AnyObj[] = view.funnelStages.filter((s: AnyObj) => s.enabled !== false && s.type !== "MANUAL_REVIEW").map((s: AnyObj) => ({
      type: s.type,
      name: s.name,
      passScore: s.passScore,
      durationMin: s.durationMin,
      gradingMode: s.gradingMode,
      isFinal: false,
      isCv: s.type === "CV_SCREENING",
    }));
  const stages: AnyObj[] = configured.some((stage: AnyObj) => stage.type === "FINAL")
    ? configured.map((stage: AnyObj) => ({ ...stage, isFinal: stage.type === "FINAL" }))
    : [...configured, { type: "FINAL", name: "Final Decision", passScore: null, durationMin: null, gradingMode: null, isFinal: true, isCv: false }];

  return stages.map((stage: AnyObj) => {
    const resultsForType = view.results.filter((r: AnyObj) => r.type === stage.type);
    const attemptsForType = view.attempts.filter((a: AnyObj) => a.type === stage.type);
    let status: StageStatus = "NOT_REACHED";
    let score: number | null = null;

    if (stage.isFinal) {
      const s = view.application.status;
      status =
        s === "OFFERED" || s === "HIRED"
          ? "PASSED"
          : s === "REJECTED"
            ? "FAILED"
            : stage.type === view.application.currentStage && (s === "HOLD" || s === "IN_PROGRESS")
              ? "ACTIVE"
              : "NOT_REACHED";
    } else if (stage.isCv) {
      const r = view.application.cvResult;
      if (r === "PASS") status = "PASSED";
      else if (r === "FAIL") status = "FAILED";
      else if (r === "PROCESSING" || r === "PENDING") status = "PENDING";
      else if (view.application.currentStage === "CV_SCREENING") status = "ACTIVE";
      score = view.application.cvScore ?? null;
    } else {
      const latest = resultsForType[resultsForType.length - 1];
      if (latest) {
        status = latest.status === "PASS" ? "PASSED" : latest.status === "FAIL" ? "FAILED" : "PENDING";
        score = latest.normalized ?? null;
      } else if (stage.type === view.application.currentStage) {
        status = view.application.phaseReleased ? "ACTIVE" : "PENDING";
      }
    }

    return { ...stage, status, score, resultsForType, attemptsForType };
  });
}

type Open =
  | { kind: "none" }
  | { kind: "profile" }
  | { kind: "stage"; type: string };

export function CandidateWorkspace({
  view,
  expanded,
  onToggleExpand,
  onSelectTrack,
  onUpdated,
}: {
  view: AnyObj;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onSelectTrack?: (applicationId: string) => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState<Open>({ kind: "profile" });
  const stages = deriveStages(view);
  const activeStage = open.kind === "stage" ? stages.find((s: AnyObj) => s.type === open.type) || null : null;

  const toggleProfile = () => setOpen((o) => (o.kind === "profile" ? { kind: "none" } : { kind: "profile" }));
  const toggleStage = (type: string) =>
    setOpen((o) => (o.kind === "stage" && o.type === type ? { kind: "none" } : { kind: "stage", type }));

  // When used inside the list accordion, expansion is controlled by the parent.
  const isExpanded = expanded ?? true;
  const nameClick = isExpanded ? toggleProfile : onToggleExpand ?? toggleProfile;
  const chipClick = isExpanded ? toggleStage : undefined;
  const collapse = isExpanded && onToggleExpand ? onToggleExpand : undefined;

  const finalStatus = (stages.find((s: AnyObj) => s.isFinal)?.status || "NOT_REACHED") as StageStatus;
  const finalBadgeCls: Record<StageStatus, string> = {
    PASSED: "badge-pass",
    FAILED: "badge-fail",
    PENDING: "badge-pending",
    ACTIVE: "badge-info",
    NOT_REACHED: "badge-muted",
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden space-y-3">
      <CandidateCard
        view={view}
        nameClick={nameClick}
        chipClick={chipClick}
        collapse={collapse}
        finalStatus={finalStatus}
        finalBadgeCls={finalBadgeCls}
        onSelectTrack={onSelectTrack}
        onUpdated={onUpdated}
      />
      {isExpanded && (
        <>
          {open.kind === "profile" && <ProfileSection view={view} onClose={() => setOpen({ kind: "none" })} />}
          {open.kind === "stage" && activeStage && (
            <StageSection view={view} stage={activeStage} onClose={() => setOpen({ kind: "none" })} onUpdated={onUpdated} />
          )}
        </>
      )}
    </div>
  );
}

function CandidateCard({
  view,
  nameClick,
  chipClick,
  collapse,
  finalStatus,
  finalBadgeCls,
  onSelectTrack,
  onUpdated,
}: {
  view: AnyObj;
  nameClick: () => void;
  chipClick?: (type: string) => void;
  collapse?: () => void;
  finalStatus: StageStatus;
  finalBadgeCls: Record<StageStatus, string>;
  onSelectTrack?: (applicationId: string) => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<ActionFeedback | null>(null);
  const stages = deriveStages(view);
  const availableFunnels = (view.funnelOptions || []).filter((funnel: AnyObj) => funnel.id !== view.application.funnelId);
  async function assignFunnel(formData: FormData) {
    setAssignmentBusy(true);
    setAssignmentFeedback(null);
    try {
      const result = await assignCandidateFunnelAction(view.application.id, formData);
      if (result && "error" in result) throw new Error(String(result.error || "Funnel assignment failed."));
      const moved = formData.get("assignmentMode") === "MOVE";
      setAssignmentFeedback({
        kind: "success",
        message: moved
          ? "Candidate moved to the selected funnel. The previous track is now staff-only history."
          : view.application.funnelId
            ? "A separate active funnel track was added for the candidate."
            : "Candidate assigned to the selected funnel and notified.",
      });
      await onUpdated?.();
      router.refresh();
    } catch (error) {
      setAssignmentFeedback({ kind: "error", message: error instanceof Error ? error.message : "Funnel assignment failed." });
    } finally {
      setAssignmentBusy(false);
    }
  }
  return (
    <div className="card p-5">
      {assignmentFeedback && <ActionFeedbackDialog feedback={assignmentFeedback} onClose={() => setAssignmentFeedback(null)} />}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={nameClick}
            className="text-2xl font-bold text-ink-900 hover:text-brand-700 underline-offset-4 hover:underline text-left"
          >
            {view.candidate.name}
          </button>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><span className="text-slate-400">ID:</span> {view.application.id}</span>
            <span><span className="text-slate-400">Position:</span> {view.application.driveName}</span>
            <span><span className="text-slate-400">Drive:</span> {view.application.driveName}</span>
            <span><span className="text-slate-400">Applied:</span> {new Date(view.application.appliedAt).toLocaleDateString()}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">Total score: {view.application.overallScore}/100</span>
            {!view.application.overallComplete && <span className="text-xs text-amber-700">Provisional until all weighted assessments are graded</span>}
            {view.canManage && view.application.status !== "ARCHIVED" && availableFunnels.length > 0 && ["PASS", "FAIL"].includes(view.application.cvResult) ? (
              <form action={assignFunnel} className="flex flex-wrap items-center gap-2" aria-busy={assignmentBusy}>
                <label className="sr-only" htmlFor={`funnel-${view.application.id}`}>Assign funnel</label>
                <select id={`funnel-${view.application.id}`} name="funnelId" className="input h-10 min-w-48" defaultValue="" required>
                  <option value="" disabled>Select assessment funnel</option>
                  {availableFunnels.map((funnel: AnyObj) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
                </select>
                {view.application.funnelId ? (
                  <>
                    <button name="assignmentMode" value="ADD" disabled={assignmentBusy} className="btn-primary whitespace-nowrap">Add another funnel</button>
                    <button name="assignmentMode" value="MOVE" disabled={assignmentBusy} className="btn-outline whitespace-nowrap">Move to funnel</button>
                  </>
                ) : (
                  <button name="assignmentMode" value="ADD" disabled={assignmentBusy} className="btn-primary whitespace-nowrap">Select &amp; release test</button>
                )}
              </form>
            ) : view.application.funnelName ? <span className="text-xs text-slate-500">Assigned path: {view.application.funnelName}</span> : view.canManage && view.application.currentStage === "CV_SCREENING" ? <span className="text-xs text-amber-700">Drive applicant pool · not assigned to a funnel</span> : null}
          </div>
          {view.siblingTracks?.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Candidate funnel tracks">
              <span className="text-xs font-semibold text-slate-600">{view.siblingTracks.length} separate tracks:</span>
              {view.siblingTracks.map((track: AnyObj) => (
                onSelectTrack ? (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelectTrack(track.id)}
                    disabled={track.id === view.application.id}
                    aria-current={track.id === view.application.id ? "true" : undefined}
                    className={track.id === view.application.id ? "badge-info" : "badge-muted hover:bg-slate-200"}
                  >
                    {track.funnelName} · {track.currentStage || "Review"}{track.archived ? " · History" : ""}
                  </button>
                ) : (
                  <Link
                    key={track.id}
                    href={`/recruiter/candidates/${track.id}`}
                    aria-current={track.id === view.application.id ? "page" : undefined}
                    className={track.id === view.application.id ? "badge-info" : "badge-muted hover:bg-slate-200"}
                  >
                    {track.funnelName} · {track.currentStage || "Review"}{track.archived ? " · History" : ""}
                  </Link>
                )
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={finalBadgeCls[finalStatus]}>{view.application.status.replace("_", " ")}</span>
          {collapse && (
            <button onClick={collapse} className="rounded-full px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Collapse">▲</button>
          )}
        </div>
      </div>

      {/* ---- Horizontal recruitment funnel ---- */}
        <div className="mt-5 w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
          <div className="flex w-max min-w-max gap-3">
          {stages.map((stage: AnyObj) => {
            const st = STATUS_STYLE[stage.status as StageStatus];
            return (
              <button
                key={stage.type}
                disabled={!chipClick}
                onClick={chipClick ? () => chipClick(stage.type) : undefined}
                className={`flex w-36 shrink-0 flex-col items-center rounded-xl border-2 p-3 text-center transition hover:shadow ${st.ring} ${chipClick ? "" : "cursor-default"}`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stage.name}</span>
                <span className={`mt-1 text-3xl font-extrabold ${st.text}`}>
                  {stage.score != null ? `${stage.score}%` : "—"}
                </span>
                <span className={`mt-1 text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-lg font-bold text-ink-900">{title}</h3>
      <button onClick={onClose} className="rounded-full px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Collapse">
        ✕
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-sm font-bold text-ink-900">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-ink-900">{value}</div>
    </div>
  );
}

function ProfileSection({ view, onClose }: { view: AnyObj; onClose: () => void }) {
  const cv = parse(view.application.extractedCv) || {};
  const rows: [string, any][] = [
    ["Full name", cv.name || view.candidate.name],
    ["Email", cv.email || view.candidate.email],
    ["Phone", cv.phone],
    ["Location", cv.location],
    ["Professional summary", cv.summary],
    ["Education", cv.education],
    ["University", cv.university],
    ["Degree", cv.degree],
    ["GPA", cv.gpa],
    ["Graduation year", cv.gradYear],
    ["Work experience", cv.experienceYears != null ? `${cv.experienceYears} years` : null],
    ["Job titles", cv.jobTitles],
    ["Companies", cv.companies],
    ["Employment dates", cv.employmentDates],
    ["Skills", cv.skills],
    ["Certifications", cv.certifications],
    ["Projects", cv.projects],
    ["Languages", cv.languages],
  ];
  const cvLink = view.cvToken ? `/api/cv/${view.application.id}?token=${view.cvToken}` : null;

  return (
    <div className="card p-5">
      <SectionHeader title={`${view.candidate.name} — Candidate Profile`} onClose={onClose} />
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, val]) => (
          <div key={label} className="border-b border-slate-100 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-sm text-ink-900">{Array.isArray(val) ? val.join(", ") : val ? String(val) : "—"}</div>
          </div>
        ))}
      </div>
      {cvLink ? (
        <a href={cvLink} className="btn-outline mt-4 inline-block text-sm" target="_blank" rel="noreferrer">
          View Original CV
        </a>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Original CV not available to your role.</p>
      )}
    </div>
  );
}

function StageSection({ view, stage, onClose, onUpdated }: { view: AnyObj; stage: AnyObj; onClose: () => void; onUpdated?: () => void | Promise<void> }) {
  const router = useRouter();
  const [actionBusy, setActionBusy] = useState(false);
  const canRetest = !stage.isCv && !stage.isFinal && !["ONSITE", "FINAL"].includes(stage.type)
    && (stage.type === view.application.currentStage || stage.resultsForType.length > 0);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  async function runRecruiterAction(action: () => Promise<any>, successMessage: string) {
    setActionBusy(true);
    setActionFeedback(null);
    try {
      const result = await action();
      if (result && "error" in result) throw new Error(String(result.error || "Action failed."));
      setActionFeedback({ kind: "success", message: successMessage });
      await onUpdated?.();
      router.refresh();
    } catch (error) {
      setActionFeedback({ kind: "error", message: error instanceof Error ? error.message : "Action failed." });
    } finally {
      setActionBusy(false);
    }
  }
  if (stage.isCv) return <CvScreeningSection view={view} onClose={onClose} />;
  if (stage.isFinal) return <FinalDecisionSection view={view} onClose={onClose} />;
  if (stage.type === "ONSITE") return <OnsiteSection view={view} stage={stage} onClose={onClose} />;

  const results = stage.resultsForType || [];
  const attempts = stage.attemptsForType || [];
  const finalResult = results[results.length - 1] || null;
  const finalAnswers = parse(finalResult?.answers);
  const assignedQuestionCount = Array.isArray(finalAnswers?.items)
    ? finalAnswers.items.length
    : Array.isArray(finalAnswers?.questions)
      ? finalAnswers.questions.length
      : stage.type === "CCAT"
        ? 80
        : stage.type === "MTT"
          ? 30
          : stage.type === "GAMES"
            ? "3 games"
            : null;
  const online = results.filter((r: AnyObj) => r.mode === "ONLINE");
  const onsite = results.filter((r: AnyObj) => r.mode === "ONSITE");
  const onlineScore = online.length ? online[online.length - 1].normalized : null;
  const onsiteScore = onsite.length ? onsite[onsite.length - 1].normalized : null;
  const isSubjective = ["CODING", "ESSAY", "PROMPT"].includes(stage.type);

  return (
    <div className="card p-5">
      {actionFeedback && <ActionFeedbackDialog feedback={actionFeedback} onClose={() => setActionFeedback(null)} />}
      <SectionHeader title={`${stage.name} — Details`} onClose={onClose} />

      {/* Assessment Overview */}
      <Section title="Assessment Overview">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Field label="Assessment" value={stage.name} />
          <Field label="Type" value={stage.type} />
          <Field label="Final score" value={finalResult ? `${finalResult.normalized}%` : "—"} />
          <Field label="Raw score" value={finalResult ? `${finalResult.rawScore}/${finalResult.maxScore}` : "—"} />
          <Field label="Questions assigned" value={assignedQuestionCount ?? "—"} />
          <Field label="Pass threshold" value={stage.passScore != null ? `${stage.passScore}%` : "—"} />
          <Field
            label="Result"
            value={finalResult ? <span className={finalResult.status === "PASS" ? "badge-pass" : finalResult.status === "FAIL" ? "badge-fail" : "badge-pending"}>{finalResult.status}</span> : "—"}
          />
          <Field label="Final attempt" value={finalResult ? `#${finalResult.attemptNumber ?? results.length}` : "—"} />
          <Field label="Mode" value={finalResult?.mode ?? "—"} />
          {finalResult && !finalResult.attemptId && <Field label="Attempt metadata" value="Legacy result · detailed timing was not recorded" />}
          {finalResult?.attemptStartedAt && <Field label="Start" value={new Date(finalResult.attemptStartedAt).toLocaleString()} />}
          {finalResult && <Field label="Submitted" value={new Date(finalResult.attemptSubmittedAt ?? finalResult.createdAt).toLocaleString()} />}
          {finalResult?.attemptDeadlineAt && <Field label="Deadline" value={new Date(finalResult.attemptDeadlineAt).toLocaleString()} />}
          {finalResult?.attemptStartedAt && finalResult?.attemptSubmittedAt && (
            <Field
              label="Duration"
              value={`${Math.max(0, Math.round((new Date(finalResult.attemptSubmittedAt).getTime() - new Date(finalResult.attemptStartedAt).getTime()) / 60000))} min`}
            />
          )}
        </div>
      </Section>

      <hr className="my-4 border-slate-100" />

      {/* All Attempts */}
      <Section title={`All Attempts (${attempts.length || results.length})`}>
        {(results.length === 0 && attempts.length === 0) && <p className="text-sm text-slate-400">No attempts yet.</p>}
        <div className="space-y-3">
          {results.map((r: AnyObj, i: number) => {
            const isFinal = i === results.length - 1;
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">Attempt {r.attemptNumber ?? i + 1}{r.attemptMode === "ONSITE" ? " — RETEST" : ""}</span>
                  <span className="badge-info">{r.attemptMode}</span>
                  <span className={r.status === "PASS" ? "badge-pass" : r.status === "FAIL" ? "badge-fail" : "badge-pending"}>{r.status}</span>
                  <span className="text-slate-500">Score: {r.normalized}%</span>
                  <IntegrityBadge level={r.integrityLevel} />
                  {isFinal && <span className="badge bg-brand-100 text-brand-700">✓ Final / Accepted</span>}
                  {r.createdAt && <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>}
                </div>

                {isSubjective ? (
                  <SubjectiveAttempt view={view} result={r} canManage={view.canManage} />
                ) : (
                  // Objective assessments: no per-question Q&A (CCAT/MTT/GAMES).
                  stage.type === "GAMES" && (
                    (() => {
                      const game = parse(r.answers) || {};
                      return (
                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
                          <span>Word search: {game.wordCorrect ?? "—"}/5</span>
                          <span>Sudoku: {game.sudokuCorrect ?? "—"}/{game.sudokuTotal ?? 51}</span>
                          <span>Crossword: {game.crosswordCorrect ?? "—"}/8</span>
                          <span className="sm:col-span-3">Completion: {game.elapsedSeconds ?? "—"} seconds · TCI: {r.normalized}</span>
                        </div>
                      );
                    })()
                  )
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Online vs Onsite */}
      {onlineScore != null && onsiteScore != null && (
        <>
          <hr className="my-4 border-slate-100" />
          <Section title="Online vs Onsite Comparison">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Online</div>
                <div className="text-2xl font-extrabold text-brand-700">{onlineScore}%</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Onsite</div>
                <div className="text-2xl font-extrabold text-brand-700">{onsiteScore}%</div>
              </div>
              <div className={`rounded-xl border p-3 ${onsiteScore - onlineScore >= 0 ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Difference</div>
                <div className={`text-2xl font-extrabold ${onsiteScore - onlineScore >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {onsiteScore - onlineScore >= 0 ? "+" : ""}{onsiteScore - onlineScore}%
                </div>
              </div>
            </div>
          </Section>
        </>
      )}

      <hr className="my-4 border-slate-100" />

      {/* Integrity */}
      <Section title="Integrity">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Status:</span>
          <IntegrityBadge level={finalResult?.integrityLevel} />
        </div>
        {finalResult?.integrityReasons && parse(finalResult.integrityReasons)?.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
            {parse(finalResult.integrityReasons).map((reason: string, idx: number) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        )}
        {finalResult?.integrityEvents && parse(finalResult.integrityEvents)?.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {parse(finalResult.integrityEvents)
              .slice()
              .sort((a: AnyObj, b: AnyObj) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime())
              .map((e: AnyObj, idx: number) => (
                <li key={idx} className="flex gap-2 border-b border-slate-100 pb-1">
                  <span className="text-slate-400">{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}</span>
                  <span className="font-mono">{e.eventType}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No integrity events recorded.</p>
        )}
      </Section>

      {/* Recruiter actions */}
      {view.canManage && view.application.status !== "ARCHIVED" && (
        <>
          <hr className="my-4 border-slate-100" />
          <Section title="Recruiter Actions">
            <div className="flex flex-wrap items-center gap-2">
              {canRetest && <form action={(formData) => runRecruiterAction(() => requestRetestAction(view.application.id, formData), `${stage.name} was reissued. The candidate has been notified.`)} className="flex items-center gap-2">
                <input type="hidden" name="type" value={stage.type} />
                {stage.type === view.application.currentStage ? (
                  <select name="mode" className="input h-10">
                    <option value="ONLINE">Retest: Online</option>
                    <option value="ONSITE">Retest: Onsite</option>
                  </select>
                ) : <input type="hidden" name="mode" value="ONSITE" />}
                <button disabled={actionBusy} className="btn-primary whitespace-nowrap">
                  {stage.type === view.application.currentStage ? "Request Retest" : "Issue onsite comparison"}
                </button>
              </form>}
              {stage.type === view.application.currentStage && (
                <>
                  <button type="button" disabled={actionBusy || !finalResult} title={!finalResult ? "Manual Pass requires a submitted result. Use Move to Next Stage to skip this assessment." : undefined} onClick={() => runRecruiterAction(() => manualPassAction(view.application.id), "Candidate passed manually and was moved to the next stage. The candidate has been notified.")} className="btn-primary whitespace-nowrap">Manual Pass</button>
                  <button type="button" disabled={actionBusy} onClick={() => runRecruiterAction(() => advanceApplicationAction(view.application.id), "Candidate was moved to the next stage and notified.")} className="btn-outline whitespace-nowrap">Move to Next Stage</button>
                  <form action={rejectApplicationAction.bind(null, view.application.id)}>
                    <button className="btn-danger whitespace-nowrap">Reject</button>
                  </form>
                </>
              )}
              <form action={sendNotificationAction.bind(null, view.application.id)} className="flex items-center gap-2">
                <input name="message" className="input h-10 !w-56" placeholder="Add recruiter note…" required />
                <button className="btn-ghost whitespace-nowrap">Add Note</button>
              </form>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {stage.type === view.application.currentStage
                ? finalResult
                  ? <>A retest creates a <strong>new assessment attempt</strong> — the previous attempt is kept for comparison.</>
                  : <>Manual Pass requires a submitted result. Use <strong>Move to Next Stage</strong> to intentionally skip an unattempted assessment.</>
                : <>This is a completed stage. Progression controls are available on the current stage; an onsite comparison creates a separate attempt without replacing this result.</>}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

function OnsiteSection({ view, stage, onClose }: { view: AnyObj; stage: AnyObj; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const invites = view.onsiteInvites || [];

  async function sendInvite(formData: FormData) {
    setBusy(true);
    setFeedback(null);
    try {
      const localDate = String(formData.get("scheduledAt") || "");
      if (localDate) formData.set("scheduledAt", new Date(localDate).toISOString());
      const result = await sendOnsiteInviteAction(view.application.id, formData);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: result.emailSent ? "success" : "error", message: result.emailSent ? "Onsite invitation email sent and the candidate was notified." : result.warning || "Invite saved, but the email could not be sent." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not send the onsite invitation." });
    } finally {
      setBusy(false);
    }
  }

  async function completeOnsite() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await advanceApplicationAction(view.application.id);
      if ("error" in result) throw new Error(result.error);
      setFeedback({ kind: "success", message: "Onsite screening marked complete and the candidate moved to the next stage." });
      router.refresh();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not complete the onsite stage." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="card p-5">
    {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
    <SectionHeader title={`${stage.name} — Invitation`} onClose={onClose} />
    <p className="mt-2 text-sm text-slate-600">This is an invitation-only screening stage. It does not create a candidate test or assessment score.</p>

    <Section title="Invitation history">
      {invites.length === 0 ? <p className="text-sm text-slate-400">No onsite invitation has been sent.</p> : <div className="space-y-2">
        {invites.map((invite: AnyObj) => <div key={invite.id} className="rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{new Date(invite.scheduledAt).toLocaleString()}</span><span className="badge-info">{invite.status}</span></div>
          <p className="mt-1 text-slate-600">{invite.location || "Location to be confirmed"}</p>
          {invite.locationUrl && <a href={invite.locationUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">Open location link</a>}
          {invite.notes && <p className="mt-1 text-xs text-slate-500">{invite.notes}</p>}
        </div>)}
      </div>}
    </Section>

    {view.canManage && <>
      <hr className="my-4 border-slate-100" />
      <Section title="Send onsite invitation">
        <form action={sendInvite} className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Date and time</label><input name="scheduledAt" type="datetime-local" className="input" required /></div>
          <div><label className="label">Location</label><input name="location" className="input" placeholder="Office address or venue" /></div>
          <div><label className="label">Map/location link</label><input name="locationUrl" type="url" className="input" placeholder="https://…" /></div>
          <div><label className="label">Instructions</label><input name="notes" className="input" placeholder="Bring ID, arrival time…" /></div>
          <button className="btn-primary sm:col-span-2" disabled={busy}>Send invitation email</button>
        </form>
        {stage.type === view.application.currentStage && <button type="button" className="btn-outline mt-3" disabled={busy} onClick={completeOnsite}>Mark onsite complete &amp; move next</button>}
      </Section>
    </>}
  </div>;
}

function SubjectiveAttempt({ view, result, canManage }: { view: AnyObj; result: AnyObj; canManage: boolean }) {
  const answers = parse(result.answers) || {};
  const items = Array.isArray(answers.items) ? answers.items : null;
  const bank = view.questionsByBank?.[result.type] || [];
  const q0 = bank[0]?.content || {};
  return (
    <details className="mt-2 group" open>
      <summary className="cursor-pointer text-xs font-semibold text-brand-700">Candidate answer &amp; evaluation</summary>
      <div className="mt-2 space-y-3 text-xs">
        {items ? (
          items.map((it: AnyObj, i: number) => (
            <div key={i} className="rounded-lg border border-slate-100 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-ink-900">{i + 1}. {it.prompt}</div>
                {it.maxScore ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{it.score ?? 0}/{it.maxScore}</span> : null}
              </div>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{it.answer || "—"}</pre>
              {it.feedback ? <div className="mt-1 text-[11px] text-slate-500">AI feedback: {it.feedback}</div> : null}
            </div>
          ))
        ) : (
          <>
            {q0.title && <div className="font-semibold text-ink-900">{q0.title}</div>}
            {q0.prompt && <div><span className="text-slate-400">Prompt: </span>{q0.prompt}</div>}
            {q0.example && <div className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-600">{q0.example}</div>}
            <div>
              <span className="text-slate-400">Candidate answer: </span>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{answers.text || "—"}</pre>
            </div>
          </>
        )}
        {result.notes && (
          <div>
            <span className="text-slate-400">AI / reviewer evaluation: </span>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-slate-700">{result.notes}</pre>
          </div>
        )}
        <div>
          Score: <span className="font-semibold">{result.normalized}/100</span>
          {result.gradedBy === "ai" && <span className="ml-2 badge-info">AI graded · review &amp; finalize</span>}
          {result.notes && result.notes.includes("Score adjusted") && (
            <span className="ml-2 badge-pending">Score updated</span>
          )}
        </div>

        {canManage && (
          <form action={updateResultScoreAction.bind(null, result.id)} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2">
            <label className="text-slate-500">
              Adjust score
              <input name="score" type="number" min={0} max={100} defaultValue={result.normalized} className="input mt-1 block w-24" />
            </label>
            <label className="text-slate-500">
              Note
              <input name="note" className="input mt-1 block" placeholder="Reason for adjustment" />
            </label>
            <button className="btn-primary">Update score</button>
          </form>
        )}
      </div>
    </details>
  );
}

function CvScreeningSection({ view, onClose }: { view: AnyObj; onClose: () => void }) {
  const app = view.application;
  const cv = parse(app.extractedCv) || {};
  return (
    <div className="card p-5">
      <SectionHeader title="CV Screening — Details" onClose={onClose} />
      <Section title="Screening Summary">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Field label="CV score" value={app.cvScore != null ? `${app.cvScore}%` : "—"} />
          <Field label="Threshold" value={`${app.cvPassThreshold}%`} />
          <Field
            label="Result"
            value={<span className={app.cvResult === "PASS" ? "badge-pass" : app.cvResult === "FAIL" ? "badge-fail" : "badge-pending"}>{app.cvResult || "—"}</span>}
          />
          <Field label="Processing" value={<span className="badge-muted">{app.cvJobStatus || "—"}</span>} />
        </div>
      </Section>
      <hr className="my-4 border-slate-100" />
      <Section title="Parsed / Extracted CV Summary">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Name" value={cv.name || view.candidate.name} />
          <Field label="Email" value={cv.email || view.candidate.email} />
          <Field label="Phone" value={cv.phone} />
          <Field label="Location" value={cv.location} />
          <Field label="University" value={cv.university} />
          <Field label="Degree" value={cv.degree} />
          <Field label="GPA" value={cv.gpa != null ? `${Number(cv.gpa).toFixed(2)}/${cv.gpaScale || 4}${cv.gpaAssumed ? " · assumed because CV did not state CGPA" : ""}` : "—"} />
          <Field label="Graduation year" value={cv.gradYear} />
          <Field label="Skills" value={Array.isArray(cv.skills) ? cv.skills.join(", ") : cv.skills} />
          <Field label="Experience" value={cv.experienceYears != null ? `${cv.experienceYears} years` : null} />
          <Field label="Extraction confidence" value={cv.extractionConfidence != null ? `${cv.extractionConfidence}%` : "—"} />
          <Field label="Candidate quality" value={cv.candidateQualityScore != null ? `${cv.candidateQualityScore}%` : "—"} />
        </div>
        {cv.fitSummary && <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-ink-900"><strong>Drive fit:</strong> {cv.fitSummary}</div>}
        {cv.summary && <p className="mt-3 text-sm text-slate-600"><strong>Candidate summary:</strong> {cv.summary}</p>}
      </Section>
      <hr className="my-4 border-slate-100" />
      <Section title="Job requirement match">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">Matched required skills</p><p className="mt-1 text-sm text-emerald-950">{(cv.matched || cv.matchedSkills || []).join(", ") || "No explicit matches"}</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold uppercase text-amber-700">Missing required evidence</p><p className="mt-1 text-sm text-amber-950">{(cv.missing || cv.missingSkills || []).join(", ") || "None detected"}</p></div>
        </div>
        {cv.skillCategories && <div className="mt-3 space-y-1 text-sm">{Object.entries(cv.skillCategories).map(([category, values]) => <p key={category}><strong>{category}:</strong> {Array.isArray(values) ? values.join(", ") : String(values)}</p>)}</div>}
      </Section>
      <hr className="my-4 border-slate-100" />
      <Section title={`Projects (${cv.projectDetails?.length || 0})`}>
        {cv.projectDetails?.length ? <div className="space-y-3">{cv.projectDetails.map((project: AnyObj, index: number) => <div key={`${project.name}-${index}`} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-ink-900">{project.name}</p>{project.description && <p className="mt-1 text-sm text-slate-600">{project.description}</p>}{project.technologies?.length ? <p className="mt-1 text-xs text-slate-500">Technology: {project.technologies.join(", ")}</p> : null}{project.url && <a href={project.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-brand-700 hover:underline">Open project link</a>}</div>)}</div> : <p className="text-sm text-slate-400">No project evidence extracted.</p>}
      </Section>
      <hr className="my-4 border-slate-100" />
      <Section title={`Work experience (${cv.experience?.length || 0})`}>
        {cv.experience?.length ? <div className="space-y-3">{cv.experience.map((job: AnyObj, index: number) => <div key={`${job.title}-${job.company}-${index}`} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold text-ink-900">{job.title || "Role not identified"}{job.company ? ` · ${job.company}` : ""}</p><p className="mt-1 text-xs text-slate-500">{job.location || "Location not stated"}{job.rawDate ? ` · ${job.rawDate}` : ""}{job.durationMonths ? ` · ${job.durationMonths} calculated month(s)` : ""}</p>{job.description && <p className="mt-2 text-sm text-slate-600">{job.description}</p>}</div>)}</div> : <p className="text-sm text-slate-400">No work experience evidence extracted.</p>}
      </Section>
      <hr className="my-4 border-slate-100" />
      <Section title="Additional evidence">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Certifications" value={cv.certifications?.join(", ") || "None extracted"} />
          <Field label="Coursework" value={cv.coursework?.join(", ") || "None extracted"} />
          <Field label="Profile links" value={cv.links?.length ? <span className="space-x-2">{cv.links.map((link: AnyObj, index: number) => <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{link.kind}</a>)}</span> : "None extracted"} />
          <Field label="Validation" value={cv.validationWarnings?.join(" · ") || "No parser warnings"} />
        </div>
      </Section>
      {cv.components && (
        <>
          <hr className="my-4 border-slate-100" />
          <Section title="Scoring breakdown (staff only)">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="py-2">Component</th><th>Score</th><th>Weight</th><th>Contribution</th></tr></thead>
                <tbody>
                  {Object.entries(cv.components).map(([key, value]) => {
                    const weight = CV_RUBRIC[key as keyof typeof CV_RUBRIC] || 0;
                    return <tr key={key} className="border-t border-slate-100"><td className="py-2 font-medium">{key === "universityDegree" ? "University & degree" : key}</td><td>{Math.round(Number(value))}</td><td>{weight}%</td><td>{(Number(value) * weight / 100).toFixed(1)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
      <div className="mt-4">
        {view.cvToken ? (
          <a href={`/api/cv/${app.id}?token=${view.cvToken}`} className="btn-outline text-sm" target="_blank" rel="noreferrer">
            View Original CV
          </a>
        ) : (
          <p className="text-xs text-slate-400">Original CV not available to your role.</p>
        )}
      </div>
    </div>
  );
}

function FinalDecisionSection({ view, onClose }: { view: AnyObj; onClose: () => void }) {
  const history = parse(view.application.stageHistory) || [];
  const finalEntries = history.filter(
    (h: AnyObj) => ["OFFERED", "HIRED", "REJECTED", "FINAL"].includes(h.status) || h.stage === "FINAL",
  );
  return (
    <div className="card p-5">
      <SectionHeader title="Final Decision — Details" onClose={onClose} />
      <Section title="Application Status">
        <div className="text-lg font-bold text-ink-900">{view.application.status.replace("_", " ")}</div>
      </Section>
      {finalEntries.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {finalEntries.map((h: AnyObj, i: number) => (
            <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{h.stage}</span>
                <span className={h.status === "PASS" || h.status === "HIRED" || h.status === "OFFERED" ? "badge-pass" : "badge-fail"}>{h.status}</span>
                <span className="text-xs text-slate-400">{h.at ? new Date(h.at).toLocaleString() : ""}</span>
              </div>
              {h.note && <p className="mt-1 text-xs text-slate-500">{h.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">No final decision recorded yet.</p>
      )}
      {view.canManage && (
        <div className="mt-4 flex gap-2">
          <form action={advanceApplicationAction.bind(null, view.application.id)}>
            <button className="btn-outline">Move to Next Stage</button>
          </form>
          <form action={rejectApplicationAction.bind(null, view.application.id)}>
            <button className="btn-danger">Reject</button>
          </form>
        </div>
      )}
    </div>
  );
}
