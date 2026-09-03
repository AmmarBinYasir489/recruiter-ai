"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserAction } from "@/app/admin/actions";
import { ActionFeedbackDialog, type ActionFeedback } from "@/components/ActionFeedbackDialog";
import { STAFF_CREATION_ROLES } from "@/lib/registration";

export function CreateUserForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [error, setError] = useState("");
  async function submit(data: FormData) {
    setBusy(true); setError("");
    try {
      const result = await createUserAction(data);
      if (result.error) { setError(result.error); return; }
      form.current?.reset();
      setFeedback({ kind: "success", message: "User created. The user list has been updated." });
      router.refresh();
    } catch { setError("Could not create the user. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    {feedback && <ActionFeedbackDialog feedback={feedback} onClose={() => setFeedback(null)} />}
    <form ref={form} action={submit} aria-busy={busy} aria-describedby={error ? "create-user-error" : undefined} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 items-end">
      <div><label className="label" htmlFor="new-user-name">Name</label><input id="new-user-name" name="name" className="input" autoComplete="name" required /></div>
      <div><label className="label" htmlFor="new-user-email">Email</label><input id="new-user-email" name="email" type="email" className="input" autoComplete="email" required aria-describedby={error ? "create-user-error" : undefined} /></div>
      <div><label className="label" htmlFor="new-user-role">Role</label><select id="new-user-role" name="role" defaultValue="recruiter" className="input">{STAFF_CREATION_ROLES.map(role => <option key={role}>{role}</option>)}</select></div>
      <div><label className="label" htmlFor="new-user-password">Temporary password</label><input id="new-user-password" name="password" type="password" minLength={12} autoComplete="new-password" className="input" required /></div>
      <button type="submit" disabled={busy} className="btn-primary">{busy ? "Creating…" : "Create"}</button>
      {error && <p id="create-user-error" role="alert" className="text-sm text-rose-700 sm:col-span-2 xl:col-span-5">{error}</p>}
    </form>
  </>;
}
