"use client";

import { useMemo, useState } from "react";

export function WordCountTextarea({
  name,
  rows = 6,
  minWords = 0,
  placeholder = "Write your response…",
  label = "Your response",
}: {
  name: string;
  rows?: number;
  minWords?: number;
  placeholder?: string;
  label?: string;
}) {
  const [value, setValue] = useState("");
  const count = useMemo(() => value.trim() ? value.trim().split(/\s+/).length : 0, [value]);
  const complete = minWords === 0 || count >= minWords;

  return (
    <div className="mt-3">
      <textarea
        name={name}
        aria-label={label}
        className="input select-text"
        rows={rows}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-describedby={`${name}-word-count`}
      />
      <div id={`${name}-word-count`} className={`mt-1 flex items-center justify-between text-xs ${complete ? "text-emerald-600" : "text-slate-500"}`} aria-live="polite">
        <span>{count} word{count === 1 ? "" : "s"}</span>
        {minWords > 0 && <span>{complete ? "Suggested length reached" : `Suggested: ${minWords - count} more`}</span>}
      </div>
      {minWords > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${Math.min(100, (count / minWords) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
