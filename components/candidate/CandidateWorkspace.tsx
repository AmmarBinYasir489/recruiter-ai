"use client";

import { useState } from "react";
import {
  advanceApplicationAction,
  rejectApplicationAction,
  manualPassAction,
  requestRetestAction,
  sendNotificationAction,
  updateResultScoreAction,
  assignCandidateFunnelAction,
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
}: {
  view: AnyObj;
  expanded?: boolean;
  onToggleExpand?: () => void;
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
      />
      {isExpanded && (
        <>
          {open.kind === "profile" && <ProfileSection view={view} onClose={() => setOpen({ kind: "none" })} />}
          {open.kind === "stage" && activeStage && (
            <StageSection view={view} stage={activeStage} onClose={() => setOpen({ kind: "none" })} />
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
}: {
  view: AnyObj;
  nameClick: () => void;
  chipClick?: (type: string) => void;
  collapse?: () => void;
  finalStatus: StageStatus;
  finalBadgeCls: Record<StageStatus, string>;
}) {
  const stages = deriveStages(view);
  return (
    <div className="card p-5">
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
            {view.canManage && view.funnelOptions?.length > 0 && view.application.currentStage === "CV_SCREENING" ? (
              <form action={assignCandidateFunnelAction.bind(null, view.application.id)} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`funnel-${view.application.id}`}>Assign funnel</label>
                <select id={`funnel-${view.application.id}`} name="funnelId" className="input h-10 min-w-48" defaultValue={view.application.funnelId || ""} required>
                  <option value="" disabled>Assign funnel</option>
                  {view.funnelOptions.map((funnel: AnyObj) => <option key={funnel.id} value={funnel.id}>{funnel.name}</option>)}
                </select>
                <button className="btn-outline whitespace-nowrap">Apply funnel</button>
              </form>
            ) : view.application.funnelName ? <span className="text-xs text-slate-500">Path: {view.application.funnelName}</span> : null}
          </div>
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

function StageSection({ view, stage, onClose }: { view: AnyObj; stage: AnyObj; onClose: () => void }) {
  if (stage.isCv) return <CvScreeningSection view={view} onClose={onClose} />;
  if (stage.isFinal) return <FinalDecisionSection view={view} onClose={onClose} />;

  const results = stage.resultsForType || [];
  const attempts = stage.attemptsForType || [];
  const finalResult = results[results.length - 1] || null;
  const online = results.filter((r: AnyObj) => r.mode === "ONLINE");
  const onsite = results.filter((r: AnyObj) => r.mode === "ONSITE");
  const onlineScore = online.length ? online[online.length - 1].normalized : null;
  const onsiteScore = onsite.length ? onsite[onsite.length - 1].normalized : null;
  const isSubjective = ["CODING", "ESSAY", "PROMPT"].includes(stage.type);

  return (
    <div className="card p-5">
      <SectionHeader title={`${stage.name} — Details`} onClose={onClose} />

      {/* Assessment Overview */}
      <Section title="Assessment Overview">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Field label="Assessment" value={stage.name} />
          <Field label="Type" value={stage.type} />
          <Field label="Final score" value={finalResult ? `${finalResult.normalized}%` : "—"} />
          <Field label="Pass threshold" value={stage.passScore != null ? `${stage.passScore}%` : "—"} />
          <Field
            label="Result"
            value={finalResult ? <span className={finalResult.status === "PASS" ? "badge-pass" : finalResult.status === "FAIL" ? "badge-fail" : "badge-pending"}>{finalResult.status}</span> : "—"}
          />
          <Field label="Final attempt" value={finalResult?.attemptNumber ? `#${finalResult.attemptNumber}` : "—"} />
          <Field label="Mode" value={finalResult?.mode ?? "—"} />
          {finalResult?.attemptStartedAt && <Field label="Start" value={new Date(finalResult.attemptStartedAt).toLocaleString()} />}
          {finalResult?.attemptSubmittedAt && <Field label="Submitted" value={new Date(finalResult.attemptSubmittedAt).toLocaleString()} />}
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
                    <p className="mt-2 text-xs text-slate-600">
                      Found {parse(r.answers)?.found ?? "—"} / {parse(r.answers)?.total ?? "—"} correct tiles. TCI: {r.normalized}.
                    </p>
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
      {view.canManage && (
        <>
          <hr className="my-4 border-slate-100" />
          <Section title="Recruiter Actions">
            <div className="flex flex-wrap items-center gap-2">
              <form action={requestRetestAction.bind(null, view.application.id)} className="flex items-center gap-2">
                <input type="hidden" name="type" value={stage.type} />
                <select name="mode" className="input h-10">
                  <option value="ONLINE">Retest: Online</option>
                  <option value="ONSITE">Retest: Onsite</option>
                </select>
                <button className="btn-primary whitespace-nowrap">Request Retest</button>
              </form>
              {stage.type === view.application.currentStage && (
                <>
                  <form action={manualPassAction.bind(null, view.application.id)}>
                    <button className="btn-primary whitespace-nowrap">Manual Pass</button>
                  </form>
                  <form action={advanceApplicationAction.bind(null, view.application.id)}>
                    <button className="btn-outline whitespace-nowrap">Move to Next Stage</button>
                  </form>
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
              A retest creates a <strong>new assessment attempt</strong> — the previous attempt is kept for comparison.
            </p>
          </Section>
        </>
      )}
    </div>
  );
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
  const cvStatus = app.cvResult || app.cvJobStatus || "PENDING";
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
          <Field label="University" value={cv.university} />
          <Field label="Degree" value={cv.degree} />
          <Field label="GPA" value={cv.gpa} />
          <Field label="Graduation year" value={cv.gradYear} />
          <Field label="Skills" value={Array.isArray(cv.skills) ? cv.skills.join(", ") : cv.skills} />
          <Field label="Experience" value={cv.experienceYears != null ? `${cv.experienceYears} years` : null} />
        </div>
        {cv.summary && <p className="mt-2 text-sm text-slate-600">{cv.summary}</p>}
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
