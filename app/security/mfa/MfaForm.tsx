"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { enrollMfa, verifyMfa, type MfaState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary min-h-11 w-full" disabled={pending} aria-busy={pending}>{pending ? "Please wait…" : label}</button>;
}

export function MfaForm({ factorId }: { factorId?: string }) {
  const [state, setState] = useState<MfaState>({ error: "", factorId });
  return <div className="space-y-4">
    {!state.factorId && <form action={async () => setState(await enrollMfa())}><Submit label="Set up authenticator" /></form>}
    {state.qr && <div className="space-y-3">
      <p className="text-sm text-slate-600">Scan this code with your authenticator app. Keep the setup key private.</p>
      <img src={state.qr.startsWith("data:image/svg+xml") ? state.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.qr)}`} width={240} height={240} className="mx-auto max-w-full" alt="Authenticator setup QR code" />
      <details><summary className="cursor-pointer text-sm">Enter setup key manually</summary><code className="mt-2 block break-all rounded-lg bg-slate-100 p-3">{state.secret}</code></details>
    </div>}
    {state.factorId && <form className="space-y-4" action={async form => {
      const result = await verifyMfa(form);
      setState(previous => ({ ...previous, error: result.error }));
    }}>
      <input type="hidden" name="factorId" value={state.factorId} />
      <div><label className="label" htmlFor="mfa-code">Authenticator code</label>
        <input id="mfa-code" name="code" className="input min-h-11 text-base" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-invalid={Boolean(state.error)} aria-describedby={state.error ? "mfa-error" : undefined} /></div>
      <Submit label="Verify and continue" />
    </form>}
    {state.error && <p id="mfa-error" role="alert" className="text-sm text-rose-700">{state.error}</p>}
  </div>;
}
