"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { submitGameAction } from "@/app/candidate/actions";
import { Card } from "@/components/ui";
import { ProctorMonitor } from "@/components/ProctorMonitor";
import { GamesAssessment } from "@/components/games/GamesAssessment";
import { shouldPreventGameFormKey } from "@/lib/games/keyboard";
import type { WordSearchPuzzle } from "@/lib/games/wordSearch";

export function GameForm({ applicationId, attemptId, puzzle }: { applicationId: string; attemptId: string; puzzle: WordSearchPuzzle }) {
  function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (!shouldPreventGameFormKey(event.key)) return;
    event.preventDefault();
  }

  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm("Submit all three games now? You cannot edit this attempt after submission.")) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={submitGameAction.bind(null, applicationId)}
      className="select-none"
      onKeyDown={preventEnterSubmit}
    >
      <ProctorMonitor stage="GAMES" applicationId={applicationId} attemptId={attemptId} />
      <Card className="space-y-3">
        <p className="text-sm text-slate-600">Complete all three Neodým cognitive games. Accuracy and completion time are scored securely.</p>
        <GamesAssessment puzzle={puzzle} attemptId={attemptId} />
        <p id="game-submit-help" className="text-xs text-slate-500">Pressing Enter does not submit this assessment. Use the button and confirm when all three games are complete.</p>
        <button type="submit" className="btn-primary" aria-describedby="game-submit-help" onClick={confirmSubmission}>Submit completed games</button>
      </Card>
    </form>
  );
}
