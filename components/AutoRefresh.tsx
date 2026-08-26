"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  const watermark = useRef<string | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (checking.current || document.visibilityState !== "visible") return;
      checking.current = true;
      try {
        const response = await fetch("/api/updates", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if (watermark.current && watermark.current !== data.watermark) router.refresh();
        watermark.current = data.watermark;
      } catch {
        // Temporary connectivity loss is retried on the next interval/focus.
      } finally {
        checking.current = false;
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    const onFocus = () => void check();
    void check();
    const timer = window.setInterval(check, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, router]);

  return null;
}
