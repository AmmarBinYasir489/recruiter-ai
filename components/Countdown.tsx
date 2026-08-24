"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function Countdown({ deadlineAt, applicationId }: { deadlineAt: string | null; applicationId: string }) {
  const router = useRouter();
  // Keep the server and first browser render deterministic. The first effect
  // tick fills the real value immediately after hydration.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineAt) return;
    let expired = false;
    const tick = () => {
      const r = new Date(deadlineAt).getTime() - Date.now();
      if (r <= 0) {
        setRemaining(0);
        if (!expired) {
          expired = true;
          router.replace(`/candidate/application/${applicationId}`);
          router.refresh();
        }
      } else {
        setRemaining(r);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    const onVisibility = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deadlineAt, applicationId, router]);

  if (!deadlineAt) return null;
  const s = remaining === null ? null : Math.floor(remaining / 1000);
  const mm = s === null ? "--" : String(Math.floor(s / 60)).padStart(2, "0");
  const ss = s === null ? "--" : String(s % 60).padStart(2, "0");
  return (
    <div className={`sticky top-3 z-20 mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${remaining !== null && remaining <= 60000 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-ink-900"}`} role="timer" aria-live={remaining !== null && remaining <= 60000 ? "assertive" : "off"}>
      <span>Time remaining</span><span className="tabular-nums text-lg">{mm}:{ss}</span>
      {(remaining ?? 1) <= 0 ? <span className="text-rose-600"> — time expired</span> : null}
    </div>
  );
}
