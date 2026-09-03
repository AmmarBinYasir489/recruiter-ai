"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type WidgetApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: WidgetApi } }

export function BotCheck({ action }: { action: "signup" | "login" | "recovery" | "reset" }) {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string>();
  const wasPending = useRef(false);
  const { pending } = useFormStatus();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!ready || !sitekey || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    const id = api.render(container.current, {
      sitekey, action, size: "flexible", callback: () => setError(false),
      "error-callback": () => setError(true),
    });
    widget.current = id;
    return () => { api.remove(id); widget.current = undefined; };
  }, [ready, sitekey, action]);
  useEffect(() => {
    // Tokens are single-use, including failed password/registration attempts.
    if (wasPending.current && !pending && widget.current !== undefined) window.turnstile?.reset(widget.current);
    wasPending.current = pending;
  }, [pending]);
  if (!sitekey) return process.env.NODE_ENV === "production"
    ? <p role="status" className="text-sm text-amber-800">Security verification is being configured. Please try again shortly.</p> : null;
  return <div className="min-w-0 overflow-hidden">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
      onReady={() => setReady(true)} onError={() => setError(true)} />
    <div ref={container} />
    {error && <p role="alert" className="text-sm text-rose-700">Security verification could not load. Check your connection and reload this page.</p>}
  </div>;
}
