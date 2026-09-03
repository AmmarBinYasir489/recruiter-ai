"use client";

import { useEffect, useState } from "react";
import { submitAutoTestAction } from "@/app/candidate/actions";
import { ProctorMonitor } from "@/components/ProctorMonitor";

type PublicQuestion = {
  number: number;
  text: string;
  options?: string[];
  optionImages?: string[];
  imageUrl?: string | null;
  localImagePath?: string | null;
};

export function CcatAssessment({
  applicationId,
  attemptId,
  questions,
  type = "CCAT",
}: {
  applicationId: string;
  attemptId: string;
  questions: PublicQuestion[];
  type?: "CCAT" | "MTT";
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`assessment:${attemptId}`) || "null");
      if (saved?.answers && typeof saved.answers === "object") setAnswers(saved.answers);
      if (Number.isInteger(saved?.current)) setCurrent(Math.max(0, Math.min(questions.length - 1, saved.current)));
    } catch { /* Storage may be unavailable; the assessment remains usable. */ }
    setLoaded(true);
  }, [attemptId, questions.length]);
  useEffect(() => {
    if (loaded) { try { sessionStorage.setItem(`assessment:${attemptId}`, JSON.stringify({ answers, current })); } catch { /* Optional recovery only. */ } }
  }, [answers, current, loaded, attemptId]);
  const question = questions[current];
  if (!question) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No CCAT questions are available.</p>;

  const answered = answers[question.number] !== undefined && answers[question.number] !== "";
  const isLast = current === questions.length - 1;

  return (
    <form onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }} action={async (formData) => { setError(""); const result = await submitAutoTestAction(applicationId, type, formData); if (result?.error) setError(result.error); }} className="select-none">
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
      <ProctorMonitor stage={type} applicationId={applicationId} attemptId={attemptId} />
      <div className="mb-4 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-ink-900">Question {current + 1} of {questions.length}</span>
        <span className="text-slate-500">{Object.keys(answers).length} answered</span>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      {questions.map((item, index) => (
        <fieldset key={item.number} className={index === current ? "card" : "hidden"} aria-hidden={index !== current}>
          <legend className="sr-only">Question {index + 1}: {item.text}</legend>
          <p className="text-lg font-semibold leading-7 text-ink-900">{item.text}</p>
          {(item.localImagePath || item.imageUrl) && (
            <img src={item.localImagePath || item.imageUrl || ""} alt="Question diagram" className="my-5 max-h-80 w-auto rounded-xl border border-slate-200 object-contain" />
          )}
          {Array.isArray(item.options) ? <div className="mt-5 grid gap-3">
            {item.options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm hover:border-brand-300 hover:bg-brand-50">
                <input
                  type="radio"
                  name={`a${item.number}`}
                  value={optionIndex}
                  checked={answers[item.number] === String(optionIndex)}
                  onChange={() => setAnswers((existing) => ({ ...existing, [item.number]: String(optionIndex) }))}
                />
                {item.optionImages?.[optionIndex]
                  ? <img src={item.optionImages[optionIndex]} alt={`Option ${String.fromCharCode(65 + optionIndex)}`} className="max-h-24 w-auto object-contain" />
                  : <span className="min-w-0 break-words"><b>{String.fromCharCode(65 + optionIndex)}.</b> {option}</span>}
              </label>
            ))}
          </div> : <input type="text" inputMode="numeric" pattern="-?[0-9]+(?:\\.[0-9]+)?" name={`a${item.number}`} value={answers[item.number] || ""} onChange={(event) => setAnswers((existing) => ({ ...existing, [item.number]: event.target.value }))} className="input mt-5 w-36 select-text" autoComplete="off" required />}
        </fieldset>
      ))}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" className="btn-outline" disabled={current === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>Previous</button>
        {isLast ? (
          <button type="submit" className="btn-primary" disabled={Object.values(answers).filter(Boolean).length !== questions.length}>Submit {type}</button>
        ) : (
          <button type="button" className="btn-primary" disabled={!answered} onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}>Next question</button>
        )}
      </div>
    </form>
  );
}
