"use client";

import Link from "next/link";
import { useState } from "react";
import { AUTH_PORTALS, PORTAL_LABELS, type AuthPortal } from "@/lib/authPortals";
import { LoginForm } from "@/app/login/LoginForm";
import { SignupForm } from "@/app/signup/SignupForm";

function PortalIcon({ portal }: { portal: AuthPortal }) {
  const paths = {
    candidate: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    recruiter: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M3 12l9 3 9-3M12 13v4" /></>,
    reviewer: <><path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 13l2 2 5-5M8 18h7" /></>,
    admin: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[portal]}</svg>;
}

export function AuthExperience({ mode, initialPortal, returnTo }: { mode: "login" | "signup"; initialPortal: AuthPortal; returnTo: string }) {
  const [portal, setPortal] = useState<AuthPortal>(initialPortal);
  const isCandidate = portal === "candidate";
  const label = PORTAL_LABELS[portal];
  const query = `portal=${portal}&returnTo=${encodeURIComponent(returnTo)}`;
  return <>
    <div className="auth-heading">
      <p className="auth-kicker">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</p>
      <h1>{mode === "login" ? "Sign in to your space." : isCandidate ? "Make your next move." : "Access your workspace."}</h1>
      <p>{mode === "login" ? "Choose your role and continue to your account." : isCandidate ? "Create an account to apply for an opportunity." : "Your organization manages staff account access."}</p>
    </div>
    <fieldset className="auth-role-group">
      <legend>{mode === "login" ? "I'm signing in as" : "I'm joining as"}</legend>
      <div className="auth-role-options">
        {AUTH_PORTALS.map(item => <label key={item} className="auth-role-option">
          <input type="radio" name="portal-entry" value={item} checked={portal === item} onChange={() => setPortal(item)} />
          <span className="auth-role-tile"><PortalIcon portal={item} /><span>{PORTAL_LABELS[item]}</span></span>
        </label>)}
      </div>
    </fieldset>
    <div className="auth-form-heading"><h2>{label} {mode === "login" ? "sign in" : isCandidate ? "sign up" : "access"}</h2><span>{isCandidate ? "Personal account" : "Team account"}</span></div>
    {mode === "login" ? <>
      {!isCandidate && <p className="auth-staff-hint">Use the account provided by your organization.</p>}
      <LoginForm returnTo={returnTo} />
    </> : isCandidate ? <SignupForm returnTo={returnTo} /> : <div className="auth-staff-access" role="status">
      <div className="auth-staff-symbol"><PortalIcon portal={portal} /></div>
      <h3>{label} accounts are managed by your organization.</h3>
      <p>{portal === "admin" ? "Administrator access is provisioned by the portal owner. Public admin registration is not available." : "Ask your administrator to create your account, then sign in with your credentials."}</p>
      <Link href={`/login?${query}`} className="auth-submit">Continue to {label.toLowerCase()} sign in <span aria-hidden="true">→</span></Link>
    </div>}
    <div className="auth-switch">
      {mode === "signup" ? <>Already have an account? <Link href={`/login?${query}`}>Sign in</Link></> : isCandidate ? <>New here? <Link href={`/signup?${query}`}>Create an account <span aria-hidden="true">↗</span></Link></> : <>Need a team account? <Link href={`/signup?${query}`}>How to get access</Link></>}
    </div>
  </>;
}
