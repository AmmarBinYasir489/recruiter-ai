"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MonitoringEventType = "TAB_SWITCH" | "FULLSCREEN_EXIT" | "FULLSCREEN_ENTER" | "COPY" | "PASTE" | "RIGHT_CLICK";
type IntegrityEvent = { eventType: MonitoringEventType; timestamp: string };
type Draft = Record<string, string[]>;

const MAX_INTEGRITY_EVENTS = 200;

export function ProctorMonitor({
  stage,
  applicationId,
  attemptId,
}: {
  stage: string;
  applicationId: string;
  attemptId: string;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenDenied, setFullscreenDenied] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const eventsRef = useRef<IntegrityEvent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const draftKey = `assessment-draft:${applicationId}:${stage}:${attemptId}`;

  const logEvent = useCallback((eventType: MonitoringEventType) => {
    if (eventsRef.current.length >= MAX_INTEGRITY_EVENTS) return;
    eventsRef.current = [...eventsRef.current, { eventType, timestamp: new Date().toISOString() }];
    if (inputRef.current) inputRef.current.value = JSON.stringify(eventsRef.current);
  }, []);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreenDenied(false);
    } catch {
      setFullscreenDenied(true);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      const inFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(inFullscreen);
      logEvent(inFullscreen ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
    };
    setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [logEvent]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) logEvent("TAB_SWITCH"); };
    const onCopy = (event: ClipboardEvent) => { event.preventDefault(); logEvent("COPY"); };
    const onPaste = (event: ClipboardEvent) => { event.preventDefault(); logEvent("PASTE"); };
    const onContextMenu = (event: MouseEvent) => { event.preventDefault(); logEvent("RIGHT_CLICK"); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [logEvent]);

  // Preserve non-file answers locally during the active attempt, restore them
  // after refresh, and clear them only when the form is submitted.
  useEffect(() => {
    const form = inputRef.current?.closest("form");
    if (!form) return;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "{}") as Draft;
      for (const control of Array.from(form.elements)) {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
        if (!control.name || control.name === "integrityEvents" || control instanceof HTMLInputElement && control.type === "file") continue;
        const values = saved[control.name];
        if (!values) continue;
        if (control instanceof HTMLInputElement && (control.type === "radio" || control.type === "checkbox")) {
          control.checked = values.includes(control.value);
        } else {
          const prototype = control instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : control instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
          setter?.call(control, values[0] ?? "");
          control.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    } catch {
      try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ }
    }

    let timer: number | undefined;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const draft: Draft = {};
        const data = new FormData(form);
        for (const [name, value] of data.entries()) {
          if (name === "integrityEvents" || typeof value !== "string") continue;
          (draft[name] ||= []).push(value);
        }
        try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage may be blocked or full. */ }
      }, 250);
    };
    const clear = () => { try { localStorage.removeItem(draftKey); } catch { /* Storage is optional. */ } };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", clear);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", clear);
    };
  }, [draftKey]);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return (
    <>
      <input ref={inputRef} type="hidden" name="integrityEvents" data-auto-refresh-pause="true" />
      {isOffline && (
        <div className="fixed inset-x-0 top-0 z-[100] bg-amber-600 px-4 py-2 text-center text-sm font-semibold text-white" role="status">
          Connection lost. Your answers remain saved on this device and the assessment timer continues.
        </div>
      )}
      {!isFullscreen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="fullscreen-title">
          <section className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3 5 6v5c0 4.6 2.8 8.4 7 10 4.2-1.6 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Secure assessment</p>
            <h2 id="fullscreen-title" className="mt-1 text-2xl font-bold text-ink-900">Continue in fullscreen</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Fullscreen keeps the assessment focused. Leaving fullscreen and changing tabs are recorded. Copy, paste, and right-click are disabled during the assessment.
            </p>
            <button type="button" onClick={enterFullscreen} className="btn-primary mt-6 w-full">
              Enter fullscreen
            </button>
            {fullscreenDenied && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
                Fullscreen was blocked. Allow fullscreen for this site and try again.
              </p>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">Your timer continues while this screen is open.</p>
          </section>
        </div>
      )}
    </>
  );
}
