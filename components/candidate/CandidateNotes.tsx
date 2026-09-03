"use client";

import { useRef, useState } from "react";
import { addStaffNoteAction, sendNotificationAction } from "@/app/recruiter/actions";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";

export function CandidateNotes({ applicationId, notes = [], onUpdated }: { applicationId: string; notes?: Array<{ id: string; message: string; author: string; createdAt: string }>; onUpdated?: () => void }) {
  const [audience, setAudience] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const form = useRef<HTMLFormElement>(null);
  async function submit(data: FormData) {
    if (audience === "candidate" && !window.confirm("Send this message to the candidate's portal?")) return;
    setBusy(true);
    try {
      const result = await (audience === "staff" ? addStaffNoteAction : sendNotificationAction)(applicationId, data);
      if (result.error) throw new Error(result.error);
      form.current?.reset();
      setFeedback({ kind: "success", message: audience === "staff" ? "Internal note saved. It is not visible to the candidate." : "Message sent to the candidate's portal." });
      onUpdated?.();
    } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Could not save. Please try again." }); }
    finally { setBusy(false); }
  }
  return <section className="mt-5 space-y-3" aria-label="Notes and candidate messages">
    {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
    <form ref={form} action={submit} aria-busy={busy} className="space-y-3">
      <label className="block text-sm font-semibold">Audience
        <select className="input mt-1" value={audience} onChange={e => setAudience(e.target.value)} disabled={busy}>
          <option value="staff">Internal staff note — private</option>
          <option value="candidate">Message to candidate — visible in their portal</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">{audience === "staff" ? "Internal note" : "Candidate message"}
        <textarea name="message" rows={3} maxLength={4000} required className="input mt-1" />
      </label>
      <button className="btn-ghost" disabled={busy}>{busy ? "Saving…" : audience === "staff" ? "Save internal note" : "Send candidate message"}</button>
    </form>
    {notes.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">Internal staff notes ({notes.length})</summary>
      <ul className="mt-3 space-y-3">{notes.map(note => <li key={note.id} className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="whitespace-pre-wrap break-words">{note.message}</p><p className="mt-1 text-xs text-slate-500">{note.author} · {new Date(note.createdAt).toLocaleString()}</p>
      </li>)}</ul>
    </details>}
  </section>;
}
