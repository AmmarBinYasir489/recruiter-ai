"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAssessmentAction } from "@/app/candidate/actions";

export function StartAssessmentButton({ applicationId, type, durationMin }: { applicationId: string; type: string; durationMin: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const res = await startAssessmentAction(applicationId, type);
    if (res && "ok" in res) {
      router.refresh();
    } else {
      setLoading(false);
      setError(res?.error || "Could not start assessment.");
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn-primary" onClick={start} disabled={loading}>
        {loading ? "Starting…" : "Start assessment"}
      </button>
      {durationMin ? <p className="text-xs text-slate-400">Time limit: {durationMin} minutes (enforced by the server).</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
