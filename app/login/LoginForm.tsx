"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginFormAction, type LoginState } from "./actions";

const initialState: LoginState = { error: "" };

function SignInButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginFormAction, initialState);
  const hasCredentialError = Boolean(state.error && state.invalidCredentials);

  return (
    <form action={formAction} className="space-y-4" noValidate={false}>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          placeholder="you@portal.com"
          aria-invalid={hasCredentialError}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          placeholder="••••••••"
          aria-invalid={hasCredentialError}
          aria-describedby={state.error ? "login-error" : undefined}
        />
      </div>
      {state.error && (
        <p id="login-error" role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      )}
      <SignInButton />
    </form>
  );
}
