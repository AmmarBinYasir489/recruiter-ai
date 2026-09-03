"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { createFunnelAction } from "@/app/recruiter/actions";

const AVAILABLE = [
  { type: "CV_SCREENING", name: "CV Screening", def: 60 },
  { type: "CCAT", name: "CCAT / IQ", def: 55 },
  { type: "MTT", name: "Math Thinking Test", def: 55 },
  { type: "GAMES", name: "Games", def: 70 },
  { type: "CODING", name: "Coding", def: 65 },
  { type: "ESSAY", name: "Essay", def: 60 },
  { type: "PROMPT", name: "Prompt Engineering", def: 65 },
  { type: "ENGLISH_SPEAKING", name: "English Speaking", def: 60 },
  { type: "ONSITE", name: "Onsite", def: 70 },
  { type: "FINAL", name: "Final Decision", def: 0 },
] as const;

const AUTOMATIC_TYPES = new Set(["CV_SCREENING", "CCAT", "MTT"]);
const MANUAL_TYPES = new Set(["CODING", "ESSAY", "PROMPT", "RAT", "ENGLISH_SPEAKING"]);

interface Row {
  type: string;
  name: string;
  enabled: boolean;
  passScore: number;
  durationMin: number;
  opensAt: string;
  gradingMode: string;
  passAction: string;
  failAction: string;
}

export function FunnelBuilder({ driveId, backHref }: { driveId: string; backHref?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>(
    AVAILABLE.map((a) => ({
      type: a.type,
      name: a.name,
      enabled: a.type === "CV_SCREENING" || a.type === "FINAL",
      passScore: a.def,
      durationMin: a.type === "CV_SCREENING" ? 0 : 20,
      opensAt: "",
      gradingMode: AUTOMATIC_TYPES.has(a.type) ? "AUTO" : MANUAL_TYPES.has(a.type) ? "MANUAL" : "AUTO",
      passAction: "NEXT",
      failAction: "REJECT",
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const stages = rows
      .filter((r) => r.enabled)
      .map((r) => ({
        type: r.type,
        name: r.name,
        enabled: true,
        passScore: r.passScore,
        durationMin: r.durationMin,
        opensAt: r.opensAt ? new Date(r.opensAt).toISOString() : undefined,
        gradingMode: r.gradingMode || undefined,
        passAction: r.passAction,
        failAction: r.failAction,
      }));
    if (stages.length === 0) {
      setError("Enable at least one phase.");
      setBusy(false);
      return;
    }
    const fd = new FormData();
    fd.set("name", name || "New Funnel");
    fd.set("stages", JSON.stringify(stages));
    try {
      const r = await createFunnelAction(driveId, fd);
      if (r?.error) {
        setError(r.error);
        setBusy(false);
        return;
      }
      router.push(backHref ?? `/recruiter/drives/${driveId}`);
    } catch (e: any) {
      if (e?.message !== "NEXT_REDIRECT") setError(e?.message || "Failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <label className="label">Funnel name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Graduate Engineer Funnel" />
      </Card>

      {rows.map((r, i) => (
        <Card key={r.type} className={r.enabled ? "" : "opacity-60"}>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 font-semibold text-ink-900">
              <input type="checkbox" checked={r.enabled} disabled={r.type === "CV_SCREENING" || r.type === "FINAL"} onChange={(e) => update(i, { enabled: e.target.checked })} />
              {r.name} <span className="text-xs text-slate-400">{r.type}</span>
            </label>
            {r.type !== "CV_SCREENING" && r.type !== "ONSITE" && r.type !== "FINAL" && (
              <div className="flex items-center gap-2 text-xs">
                <span>Pass ≥</span>
                <input type="number" className="input w-20" value={r.passScore} onChange={(e) => update(i, { passScore: Number(e.target.value) })} />
              </div>
            )}
          </div>
          {r.enabled && r.type === "ONSITE" && <p className="mt-3 text-sm text-slate-500">Invitation-only stage. Recruiters schedule the screening and send the candidate an email; no portal test or score is created.</p>}
          {r.enabled && r.type !== "CV_SCREENING" && r.type !== "ONSITE" && r.type !== "FINAL" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs">
              <div>
                <label className="label">Duration (min)</label>
                <input type="number" className="input" value={r.durationMin} onChange={(e) => update(i, { durationMin: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Opens at (optional)</label>
                <input type="datetime-local" className="input" value={r.opensAt} onChange={(e) => update(i, { opensAt: e.target.value })} />
                <p className="mt-1 text-[11px] text-slate-400">Selected candidates are notified now but cannot start before this time.</p>
              </div>
              <div className="sm:col-span-2">
                <p className="font-medium">Automatic scoring · staff approval</p>
                <p className="mt-1 text-slate-500">Every submitted result stays on Hold. Staff applies a threshold or chooses Pass / Hold / Fail. Pass releases the next enabled phase.</p>
              </div>
            </div>
          )}
        </Card>
      ))}

      {error && <Card className="border-rose-200 bg-rose-50 text-rose-700 text-sm">{error}</Card>}
      <button className="btn-primary w-full" onClick={submit} disabled={busy}>Create funnel</button>
    </div>
  );
}
