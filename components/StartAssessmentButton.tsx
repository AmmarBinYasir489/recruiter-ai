"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAssessmentAction } from "@/app/candidate/actions";

export function StartAssessmentButton({ applicationId, type, durationMin }: { applicationId: string; type: string; durationMin: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) {
      setError("This browser cannot run the required fullscreen assessment. Use a fullscreen-capable browser on a computer or supported device. Your test has not started.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await startAssessmentAction(applicationId, type);
      if (res && "ok" in res) router.refresh();
      else setError(res?.error || "Could not start assessment.");
    } catch { setError("Could not connect. Please try again; your assessment status will be checked before starting."); }
    finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn-primary" onClick={start} disabled={loading}>
        {loading ? "Starting…" : "Start assessment"}
      </button>
      {durationMin ? <p className="text-xs text-slate-400">Time limit: {durationMin} minutes (enforced by the server).</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
