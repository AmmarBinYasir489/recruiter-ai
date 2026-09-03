"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signupAction, type SignupState } from "./actions";
import { BotCheck } from "@/components/BotCheck";
import { PasswordInput } from "@/components/auth/PasswordInput";

function SignupButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className="auth-submit">
    {pending ? "Creating account…" : "Create candidate account"}<span aria-hidden="true">→</span>
  </button>;
}

export function SignupForm({ returnTo }: { returnTo: string }) {
  const [state, setState] = useState<SignupState>({ error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function action(data: FormData) { setState(await signupAction(state, data)); }
  return <form action={action} className="auth-form">
    <input type="hidden" name="returnTo" value={returnTo} />
    <div>
      <label htmlFor="signup-email" className="auth-label">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required
        value={email} onChange={(event) => setEmail(event.target.value)}
        className="auth-input" placeholder="you@example.com" aria-invalid={state.field === "email" || undefined}
        aria-describedby={state.error ? "signup-error" : undefined} />
    </div>
    <div>
      <label htmlFor="signup-password" className="auth-label">Password</label>
      <PasswordInput id="signup-password" name="password" autoComplete="new-password" minLength={12} maxLength={72} required
        value={password} onChange={(event) => setPassword(event.target.value)}
        placeholder="Create a password" aria-invalid={state.field === "password" || undefined}
        aria-describedby={`signup-password-help${state.error ? " signup-error" : ""}`} />
      <p id="signup-password-help" className="mt-2 text-sm text-slate-600">At least 12 characters.</p>
    </div>
    {state.error && <p id="signup-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{state.error}</p>}
    <BotCheck action="signup" />
    <SignupButton />
  </form>;
}
