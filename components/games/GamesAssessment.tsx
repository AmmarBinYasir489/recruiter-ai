"use client";

import { WordSearchAssessment } from "@/components/games/WordSearchAssessment";

const SUDOKU = [
  [1, 0, 3, 4],
  [3, 4, 0, 2],
  [2, 1, 4, 0],
  [0, 3, 2, 1],
];
const BLANK_INDEX: Record<string, number> = { "0,1": 1, "1,2": 2, "2,3": 3, "3,0": 4 };

export function GamesAssessment() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="word-search-title">
        <h3 id="word-search-title" className="mb-2 text-lg font-bold text-ink-900">1. Word search</h3>
        <WordSearchAssessment />
      </section>

      <section aria-labelledby="sudoku-title" className="border-t border-slate-100 pt-6">
        <h3 id="sudoku-title" className="text-lg font-bold text-ink-900">2. Mini Sudoku</h3>
        <p className="mb-3 text-sm text-slate-500">Fill each blank so every row and column contains 1–4 once.</p>
        <div className="grid w-fit grid-cols-4 overflow-hidden rounded-lg border-2 border-slate-700" role="grid" aria-label="4 by 4 Sudoku">
          {SUDOKU.map((row, rowIndex) => row.map((value, colIndex) => {
            const blank = BLANK_INDEX[`${rowIndex},${colIndex}`];
            return blank ? (
              <input
                key={`${rowIndex},${colIndex}`}
                name={`sudoku_${blank}`}
                type="number"
                min="1"
                max="4"
                required
                aria-label={`Sudoku row ${rowIndex + 1}, column ${colIndex + 1}`}
                className="h-12 w-12 border border-slate-300 text-center font-bold outline-none focus:bg-brand-50"
              />
            ) : (
              <div key={`${rowIndex},${colIndex}`} role="gridcell" className="grid h-12 w-12 place-items-center border border-slate-300 bg-slate-100 font-bold">{value}</div>
            );
          }))}
        </div>
      </section>

      <section aria-labelledby="crossword-title" className="border-t border-slate-100 pt-6">
        <h3 id="crossword-title" className="text-lg font-bold text-ink-900">3. Technical crossword</h3>
        <div className="mt-3 grid gap-3">
          <label className="text-sm"><span className="mb-1 block font-medium">1. Instructions a computer can execute (4)</span><input name="crossword_1" className="input max-w-xs uppercase" required autoComplete="off" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">2. Information used for analysis (4)</span><input name="crossword_2" className="input max-w-xs uppercase" required autoComplete="off" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">3. Machine intelligence, abbreviated (2)</span><input name="crossword_3" className="input max-w-xs uppercase" required autoComplete="off" /></label>
        </div>
      </section>
    </div>
  );
}
