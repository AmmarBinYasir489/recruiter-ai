"use client";

import { useMemo, useRef, useState } from "react";

export function WordCountTextarea({
  name,
  rows = 6,
  minWords = 0,
  placeholder = "Write your response…",
}: {
  name: string;
  rows?: number;
  minWords?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const count = useMemo(() => value.trim() ? value.trim().split(/\s+/).length : 0, [value]);
  const complete = minWords === 0 || count >= minWords;

  function update(next: string) {
    setValue(next);
    ref.current?.setCustomValidity(minWords > 0 && next.trim().split(/\s+/).filter(Boolean).length < minWords
      ? `Please write at least ${minWords} words.`
      : "");
  }

  return (
    <div className="mt-3">
      <textarea
        ref={ref}
        name={name}
        className="input"
        rows={rows}
        required
        value={value}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        aria-describedby={`${name}-word-count`}
      />
      <div id={`${name}-word-count`} className={`mt-1 flex items-center justify-between text-xs ${complete ? "text-emerald-600" : "text-slate-500"}`} aria-live="polite">
        <span>{count} word{count === 1 ? "" : "s"}</span>
        {minWords > 0 && <span>{complete ? "Minimum reached" : `${minWords - count} more needed`}</span>}
      </div>
      {minWords > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${Math.min(100, (count / minWords) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
