"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { applyAction } from "@/app/candidate/actions";
import { prepareCvUploadAction } from "@/app/candidate/uploadActions";

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
    setState({ error: "" });
    const file = data.get("cvFile") as File;
    if (!file?.size) { setState({ error: "Choose your CV first.", field: "cvFile" }); return; }
    const inferred = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.name.toLowerCase().endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : file.name.toLowerCase().endsWith(".txt") ? "text/plain" : "";
    try {
      const upload = await prepareCvUploadAction(driveId, { name: file.name, mime: file.type || inferred, size: file.size });
      if (upload.error) { setState({ error: upload.error, field: "cvFile" }); return; }
      if (upload.direct && upload.signedUrl && upload.ticket) {
        // File bytes go directly to private storage, not through Vercel's
        // server-action/request-body size limit.
        const response = await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": file.type || inferred }, body: file });
        if (!response.ok) { setState({ error: "CV upload failed. Please retry.", field: "cvFile" }); return; }
        data.delete("cvFile");
        data.set("cvUploadTicket", upload.ticket);
      }
    } catch { setState({ error: "Upload could not be completed. Check your connection and try again." }); return; }
    // Keep Next's redirect outside the upload catch block.
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
