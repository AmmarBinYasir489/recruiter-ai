"use client";

export default function AssessmentError({ reset }: { reset: () => void }) {
  return <div className="card mx-auto max-w-3xl space-y-3" role="alert">
    <h1 className="text-xl font-bold">We couldn’t load your assessment</h1>
    <p>Your saved answers are not graded as a failure. Try again, or contact the recruitment team if the problem continues. An already-started timer continues to run.</p>
    <button className="btn-primary" onClick={reset}>Try again</button>
    <a className="btn-outline ml-2" href="/candidate">Back to dashboard</a>
  </div>;
}
