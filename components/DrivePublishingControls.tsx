"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { publicApplyPath } from "@/lib/publicApplications";
import { changeDriveStatus } from "@/app/recruiter/driveLifecycleActions";

export function DrivePublishingControls({ driveId, status }: { driveId: string; status: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(publicApplyPath(driveId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setUrl(new URL(publicApplyPath(driveId), window.location.origin).href); }, [driveId]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setMessage("Application link copied. Anyone with this link can sign up and apply while intake is open."); }
    catch { setMessage("Copy the application link from the field above."); }
  }
  async function change(next: string) {
    if (!window.confirm(next === "CLOSED" ? "Close new applications? Existing candidates can continue their tests." : `Change this drive to ${next.toLowerCase()}? Records will be preserved.`)) return;
    setBusy(true);
    try { const result = await changeDriveStatus(driveId, next); setMessage(result.error || `Drive is now ${next.toLowerCase()}. Records have been preserved.`); if (!result.error) router.refresh(); }
    catch { setMessage("Could not update the drive. Please try again."); }
    finally { setBusy(false); }
  }
  const options: Record<string, { value: string; label: string }[]> = {
    OPEN: [{ value: "CLOSED", label: "Close applications" }],
    CLOSED: [{ value: "OPEN", label: "Reopen applications" }, { value: "COMPLETED", label: "Mark completed" }],
    COMPLETED: [{ value: "ARCHIVED", label: "Archive drive" }, { value: "CLOSED", label: "Resume recruitment" }],
    ARCHIVED: [{ value: "COMPLETED", label: "Restore to completed" }],
  };
  return <section className="card my-5 space-y-3" aria-label="Drive publishing">
    <h2 className="text-lg font-semibold">Public application link</h2>
    <label className="sr-only" htmlFor={`drive-link-${driveId}`}>Share this application link</label>
    <div className="flex flex-col gap-2 sm:flex-row"><input id={`drive-link-${driveId}`} className="input min-w-0 flex-1" value={url} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" className="btn-outline" onClick={copyLink}>Copy link</button></div>
    <p className="text-sm text-slate-600">Applicants upload their CV and join this drive’s pool. Recruiters assign them to a funnel after screening. Closing intake never stops an existing test.</p>
    <div className="flex flex-wrap gap-2">{(options[status] || []).map((option) => <button type="button" key={option.value} disabled={busy} className="btn-ghost" onClick={() => change(option.value)}>{busy ? "Updating…" : option.label}</button>)}</div>
    {message && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-ink-900">{message}</p>}
  </section>;
}
