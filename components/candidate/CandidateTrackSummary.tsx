import type { buildTrackComparison } from "@/lib/trackComparison";

type Summary = {
  funnelDisplayName?: string; scoreMode: string; overallScore: number;
  overall?: { gradedCount: number; assessmentCount: number }; overallComplete: boolean;
};

export function CandidateTrackSummary({ application, phase }: { application: Summary; phase: string }) {
  return <section aria-label="Selected track summary" className="mt-5 rounded-xl bg-slate-50 p-4">
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
      <div className="min-w-0"><dt className="text-xs text-slate-500">Selected track</dt><dd className="mt-1 break-words font-semibold text-ink-900">{application.funnelDisplayName || "Applicant pool"}</dd></div>
      <div><dt className="text-xs text-slate-500">Delivery mode</dt><dd className="mt-1 font-semibold text-ink-900">{application.scoreMode}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500">Current phase</dt><dd className="mt-1 break-words font-semibold text-ink-900">{phase}</dd></div>
      <div><dt className="text-xs text-slate-500">Weighted assessments graded</dt><dd className="mt-1 font-semibold tabular-nums text-ink-900">{application.overall?.gradedCount ?? 0} / {application.overall?.assessmentCount ?? 0}</dd></div>
      <div><dt className="text-xs text-slate-500">{application.overallComplete ? "Total score" : "Provisional total"}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-ink-900">{application.overallScore}<span className="text-sm font-normal text-slate-500"> /100</span></dd></div>
    </dl>
  </section>;
}

export function TrackComparison({ funnelName, rows }: { funnelName: string; rows: ReturnType<typeof buildTrackComparison> }) {
  return <details className="mt-5 rounded-xl border border-slate-200 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">Online / onsite comparison · {funnelName}</summary>
    <section aria-label="Same-funnel score comparison" className="mt-4">
      <p className="text-xs text-slate-500">Only this funnel&apos;s records are compared, using the same enabled phases and weights. Retests stay separate from full sessions. CV screening is shared; incomplete totals are provisional.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Online and onsite results for {funnelName}</caption>
          <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th scope="col" className="py-2 pr-4">Source</th><th scope="col" className="py-2 pr-4">Mode</th><th scope="col" className="py-2 pr-4">Graded</th><th scope="col" className="py-2">Total /100</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.key} className="border-b border-slate-100 last:border-0">
            <th scope="row" className="py-3 pr-4 font-medium text-ink-900">{row.source}{row.selected && <span className="ml-2 badge-info">Selected track</span>}{row.archived && <span className="ml-2 badge-muted">History</span>}</th>
            <td className="py-3 pr-4">{row.mode === "ONSITE" ? "Onsite" : "Online"}</td>
            <td className="py-3 pr-4 whitespace-nowrap tabular-nums">{row.gradedCount} / {row.assessmentCount}</td>
            <td className="py-3 tabular-nums"><span className="font-semibold">{row.total}</span><span className="ml-2 text-xs text-slate-500">{row.complete ? "Complete" : "Provisional"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!rows.some((row) => row.mode === "ONSITE") && <p className="mt-3 text-xs text-slate-500">No onsite session or retest is recorded for this funnel yet.</p>}
      {!rows.some((row) => row.mode === "ONLINE") && <p className="mt-3 text-xs text-slate-500">No online track is recorded for this funnel.</p>}
    </section>
  </details>;
}
