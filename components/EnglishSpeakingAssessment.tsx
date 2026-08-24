"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitEnglishSpeakingAction } from "@/app/candidate/actions";
import { ProctorMonitor } from "@/components/ProctorMonitor";

export function EnglishSpeakingAssessment({
  applicationId,
  attemptId,
  questions,
  minSeconds,
  maxSeconds,
}: {
  applicationId: string;
  attemptId: string;
  questions: string[];
  minSeconds: number;
  maxSeconds: number;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const [status, setStatus] = useState<"idle" | "recording" | "recorded" | "uploading">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxSeconds) recorderRef.current?.stop();
    }, 500);
    return () => window.clearInterval(timer);
  }, [status, maxSeconds]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const time = useMemo(() => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, [seconds]);

  async function startRecording() {
    setError(null);
    setBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported by this browser. Use a current version of Chrome, Edge, or Firefox.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
      const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type)) || "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const recording = new Blob(chunksRef.current, { type: mimeType });
        setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
        setBlob(recording);
        setAudioUrl(URL.createObjectURL(recording));
        setStatus("recorded");
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setSeconds(0);
      recorder.start(1000);
      setStatus("recording");
    } catch {
      setError("Microphone access was not granted. Allow microphone access and try again.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submit() {
    if (!blob) return;
    if (seconds < minSeconds) { setError(`Please record at least ${minSeconds / 60} minutes.`); return; }
    if (seconds > maxSeconds + 5) { setError(`Please keep the recording under ${maxSeconds / 60} minutes.`); return; }
    setStatus("uploading");
    setError(null);
    try {
      const prepared = await fetch("/api/english-speaking/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, attemptId, mimeType: blob.type, byteSize: blob.size }),
      });
      const upload = await prepared.json();
      if (!prepared.ok) throw new Error(upload.error || "Could not prepare upload.");
      const sent = await fetch(upload.signedUrl, { method: "PUT", headers: { "content-type": blob.type }, body: blob });
      if (!sent.ok) throw new Error("The secure audio upload failed. Please try again.");
      const formData = new FormData(formRef.current ?? undefined);
      formData.set("attemptId", attemptId);
      formData.set("bucket", upload.bucket);
      formData.set("storagePath", upload.storagePath);
      formData.set("mimeType", blob.type);
      formData.set("byteSize", String(blob.size));
      formData.set("durationSeconds", String(seconds));
      const response = await submitEnglishSpeakingAction(applicationId, formData);
      if (response?.error) throw new Error(response.error);
    } catch (cause) {
      setStatus("recorded");
      setError(cause instanceof Error ? cause.message : "Submission failed.");
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()}>
      <ProctorMonitor stage="ENGLISH_SPEAKING" applicationId={applicationId} attemptId={attemptId} />
      <div className="card space-y-5">
        <div>
          <h2 className="text-lg font-bold text-ink-900">English speaking check</h2>
          <p className="mt-1 text-sm text-slate-600">Answer all prompts in one continuous voice note. Accent is not graded; reviewers assess clear communication.</p>
        </div>
        <ol className="list-decimal space-y-2 rounded-xl bg-slate-50 px-5 py-4 pl-9 text-sm text-slate-700">
          {questions.map((question) => <li key={question}>{question}</li>)}
        </ol>
        <div className="rounded-2xl border border-slate-200 p-5 text-center">
          <p className="text-4xl font-bold tabular-nums text-ink-900">{time}</p>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">Target {minSeconds / 60}–{maxSeconds / 60} minutes</p>
          {audioUrl ? <audio className="mt-4 w-full" src={audioUrl} controls preload="metadata" /> : null}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {status === "recording" ? (
              <button type="button" onClick={stopRecording} className="btn-danger">Stop recording</button>
            ) : status === "recorded" ? (
              <><button type="button" onClick={startRecording} className="btn-outline">Record again</button><button type="button" onClick={submit} className="btn-primary">Submit voice note</button></>
            ) : status === "uploading" ? (
              <button type="button" disabled className="btn-primary">Uploading securely…</button>
            ) : (
              <button type="button" onClick={startRecording} className="btn-primary">Start voice recording</button>
            )}
          </div>
        </div>
        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
