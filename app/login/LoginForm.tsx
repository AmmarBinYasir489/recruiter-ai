"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { loginFormAction, type LoginState } from "./actions";
import { BotCheck } from "@/components/BotCheck";
import Link from "next/link";
import { PasswordInput } from "@/components/auth/PasswordInput";

const initialState: LoginState = { error: "" };

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-submit" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in…" : "Sign in"}<span aria-hidden="true">→</span>
    </button>
  );
}

export function LoginForm({ returnTo = "/candidate" }: { returnTo?: string }) {
  const [state, setState] = useState(initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function formAction(data: FormData) { setState(await loginFormAction(state, data)); }
  const hasCredentialError = Boolean(state.error && state.invalidCredentials);

  return (
    <form action={formAction} className="auth-form" noValidate={false}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label className="auth-label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          className="auth-input"
          placeholder="you@example.com"
          maxLength={254}
          aria-invalid={hasCredentialError}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      <div>
        <div className="auth-label-row"><label className="auth-label" htmlFor="password">Password</label><Link href="/forgot-password">Forgot password?</Link></div>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          maxLength={256}
          aria-invalid={hasCredentialError}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      {state.error && (
        <p id="login-error" role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      )}
      <BotCheck action="login" />
      <SignInButton />
    </form>
  );
}
