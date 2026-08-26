"use client";

import { useState } from "react";
import { submitAutoTestAction } from "@/app/candidate/actions";
import { ProctorMonitor } from "@/components/ProctorMonitor";

type PublicQuestion = {
  number: number;
  text: string;
  options: string[];
  imageUrl?: string | null;
  localImagePath?: string | null;
};

export function CcatAssessment({
  applicationId,
  attemptId,
  questions,
}: {
  applicationId: string;
  attemptId: string;
  questions: PublicQuestion[];
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const question = questions[current];
  if (!question) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No CCAT questions are available.</p>;

  const answered = answers[question.number] !== undefined;
  const isLast = current === questions.length - 1;

  return (
    <form action={submitAutoTestAction.bind(null, applicationId, "CCAT")}>
      <ProctorMonitor stage="CCAT" applicationId={applicationId} attemptId={attemptId} />
      <div className="mb-4 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-ink-900">Question {current + 1} of {questions.length}</span>
        <span className="text-slate-500">{Object.keys(answers).length} answered</span>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      {questions.map((item, index) => (
        <fieldset key={item.number} className={index === current ? "card" : "hidden"} aria-hidden={index !== current}>
          <legend className="text-lg font-semibold leading-7 text-ink-900">{item.text}</legend>
          {(item.localImagePath || item.imageUrl) && (
            <img src={item.localImagePath || item.imageUrl || ""} alt="Question diagram" className="my-5 max-h-80 w-auto rounded-xl border border-slate-200 object-contain" />
          )}
          <div className="mt-5 grid gap-3">
            {item.options.map((option, optionIndex) => (
              <label key={optionIndex} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm hover:border-brand-300 hover:bg-brand-50">
                <input
                  type="radio"
                  name={`a${item.number}`}
                  value={optionIndex}
                  checked={answers[item.number] === optionIndex}
                  onChange={() => setAnswers((existing) => ({ ...existing, [item.number]: optionIndex }))}
                />
                <span><b>{String.fromCharCode(65 + optionIndex)}.</b> {option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" className="btn-outline" disabled={current === 0} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>Previous</button>
        {isLast ? (
          <button type="submit" className="btn-primary" disabled={Object.keys(answers).length !== questions.length}>Submit CCAT</button>
        ) : (
          <button type="button" className="btn-primary" disabled={!answered} onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}>Next question</button>
        )}
      </div>
    </form>
  );
}
