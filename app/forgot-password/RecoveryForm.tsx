"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { BotCheck } from "@/components/BotCheck";
import { requestRecovery, resetPassword, type RecoveryState } from "./actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} aria-busy={pending} className="btn-primary min-h-11 w-full">{pending ? "Please wait…" : children}</button>;
}

export function RecoveryForm() {
  const [state, setState] = useState<RecoveryState>({ error: "" });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  if (state.completed) return <div className="space-y-4"><p role={state.error ? "alert" : "status"}>{state.error || state.message}</p><Link className="btn-primary min-h-11 w-full" href="/login">Sign in</Link></div>;
  return <div className="space-y-4">
    <form className="space-y-4" action={async form => {
      const result = sent ? await resetPassword(form) : await requestRecovery(form);
      setState(result);
      if (result.sent) setSent(true);
    }}>
      <div><label className="label" htmlFor="recovery-email">Email</label>
        <input className="input min-h-11 text-base" id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} readOnly={sent} onChange={event => setEmail(event.target.value)} aria-describedby={state.error ? "recovery-error" : undefined} /></div>
      {sent && <>
        <p className="text-sm text-slate-600" role="status">{SENT_HELP}</p>
        <div><label className="label" htmlFor="recovery-code">Email recovery code</label><input className="input min-h-11 text-base" id="recovery-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} required aria-describedby={state.error ? "recovery-error" : undefined} /></div>
        <div><label className="label" htmlFor="recovery-mfa">Authenticator code (if enabled)</label><input className="input min-h-11 text-base" id="recovery-mfa" name="mfaCode" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} aria-describedby="recovery-mfa-help" /><p id="recovery-mfa-help" className="mt-2 text-sm text-slate-600">Staff accounts with two-step verification must enter their app code too.</p></div>
        <div><label className="label" htmlFor="recovery-password">New password</label><input className="input min-h-11 text-base" id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-help recovery-error" /><p className="mt-2 text-sm text-slate-600" id="password-help">At least 12 characters.</p></div>
        <div><label className="label" htmlFor="recovery-confirm">Confirm new password</label><input className="input min-h-11 text-base" id="recovery-confirm" name="confirmPassword" type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} aria-describedby={state.error ? "recovery-error" : undefined} /></div>
      </>}
      <BotCheck key={sent ? "reset" : "recovery"} action={sent ? "reset" : "recovery"} />
      <p id="recovery-error" role="alert" className="text-sm text-rose-700">{state.error}</p>
      <Submit>{sent ? "Update password" : "Send recovery code"}</Submit>
    </form>
    {sent && <button type="button" className="btn-outline min-h-11 w-full" onClick={() => { setSent(false); setState({ error: "" }); setPassword(""); setConfirmation(""); }}>Request a new code or change email</button>}
  </div>;
}
const SENT_HELP = "If your email has a linked portal account, check your inbox and spam folder for the recovery code.";
