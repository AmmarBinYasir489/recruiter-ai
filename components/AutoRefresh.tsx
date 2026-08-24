"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  const watermark = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/updates", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if (watermark.current && watermark.current !== data.watermark) router.refresh();
        watermark.current = data.watermark;
      } catch {
        // Temporary connectivity loss is retried on the next interval/focus.
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const timer = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, router]);

  return null;
}
