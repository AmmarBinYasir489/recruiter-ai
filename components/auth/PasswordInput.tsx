"use client";

import { useState, type InputHTMLAttributes } from "react";

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-wrap">
    <input {...props} type={visible ? "text" : "password"} className={`auth-input auth-password-input ${props.className || ""}`} />
    <button type="button" className="auth-password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls={props.id} onClick={() => setVisible(value => !value)}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>
    </button>
  </div>;
}
