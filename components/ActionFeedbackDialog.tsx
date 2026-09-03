"use client";

import { useEffect, useRef } from "react";

export type ActionFeedback = { kind: "success" | "error"; message: string };

export function ActionFeedbackDialog({ feedback, onClose }: { feedback: ActionFeedback; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const failed = feedback.kind === "error";
  const titleId = "action-feedback-title";
  const descriptionId = "action-feedback-description";
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Dismiss through the button/cancel handlers only. Strict Mode's effect
      // cleanup calls close(); its native event must not erase new feedback.
      className="fixed inset-0 m-auto w-[min(92vw,34rem)] rounded-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-950/70"
    >
      <div className={`border-t-8 px-7 py-8 text-center ${failed ? "border-rose-500" : "border-emerald-500"}`} role={failed ? "alert" : "status"} aria-live="assertive">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${failed ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`} aria-hidden="true">
          {failed ? "!" : "✓"}
        </div>
        <h2 id={titleId} className="mt-5 text-2xl font-black text-ink-900">{failed ? "Action could not be completed" : "Action completed"}</h2>
        <p id={descriptionId} className="mt-3 text-base leading-7 text-slate-600">{feedback.message}</p>
        <button type="button" autoFocus onClick={onClose} className={`mt-7 w-full ${failed ? "btn-danger" : "btn-primary"}`}>
          Continue
        </button>
      </div>
    </dialog>
  );
}
