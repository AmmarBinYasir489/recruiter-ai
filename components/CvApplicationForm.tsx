"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { applyAction } from "@/app/candidate/actions";

type FormState = { error: string; field?: string };

function SubmitCv() {
  const { pending } = useFormStatus();
  return <>
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Uploading CV…" : "Submit application"}
    </button>
    <p role="status" className="text-sm text-slate-600">
      {pending ? "Please wait while your CV is securely uploaded. You will be taken to your application when it is received." : ""}
    </p>
  </>;
}

export function CvApplicationForm({ driveId }: { driveId: string }) {
  const [state, setState] = useState<FormState>({ error: "" });
  async function formAction(data: FormData) {
    setState(await applyAction(driveId, data));
  }

  return <form action={formAction} className="flex flex-col gap-4">
    <p className="text-sm text-slate-600">
      Just upload your CV. We extract your profile, education, skills, projects and work experience from the document—no need to enter them again.
    </p>
    <div>
      <label className="label" htmlFor="application-cv">Upload your CV</label>
      <input
        id="application-cv" type="file" name="cvFile" accept=".pdf,.docx,.txt"
        aria-describedby={`application-cv-help${state.error ? " application-error" : ""}`}
        aria-invalid={state.field === "cvFile" || undefined} className="input" required
      />
      <p id="application-cv-help" className="mt-2 text-sm text-slate-600">
        PDF, DOCX or TXT, up to 10 MB. Convert older DOC files to PDF or DOCX first. Your CV is stored privately and processed using the portal’s configured extraction and AI services.
      </p>
    </div>
    {state.error && <p id="application-error" role="alert" className="text-sm text-rose-700">{state.error}</p>}
    <SubmitCv />
  </form>;
}
