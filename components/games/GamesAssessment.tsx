"use client";

import { useEffect, useState } from "react";
import { WordSearchAssessment } from "@/components/games/WordSearchAssessment";

const SUDOKU = [
  [5,3,0,0,7,0,0,0,0], [6,0,0,1,9,5,0,0,0], [0,9,8,0,0,0,0,6,0],
  [8,0,0,0,6,0,0,0,3], [4,0,0,8,0,3,0,0,1], [7,0,0,0,2,0,0,0,6],
  [0,6,0,0,0,0,2,8,0], [0,0,0,4,1,9,0,0,5], [0,0,0,0,8,0,0,7,9],
];
const CROSSWORD_CELLS = new Set(["2,1", "2,2", "2,3", "2,4", "3,3", "4,3", "5,3", "5,4"]);
const CROSSWORD_NUMBERS: Record<string, number> = { "2,1": 1, "2,3": 2, "5,3": 3 };

export function GamesAssessment() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="space-y-8">
    <input type="hidden" name="games_elapsed_seconds" value={elapsed} />
    <section aria-labelledby="word-search-title">
      <h3 id="word-search-title" className="mb-2 text-lg font-bold text-ink-900">1. Word search</h3>
      <WordSearchAssessment />
    </section>
    <section aria-labelledby="sudoku-title" className="border-t border-slate-100 pt-6">
      <h3 id="sudoku-title" className="text-lg font-bold text-ink-900">2. Sudoku</h3>
      <p className="mb-3 text-sm text-slate-500">Complete the 9×9 board so every row, column, and 3×3 box contains 1–9 once.</p>
      <div className="mx-auto grid aspect-square w-full max-w-xl grid-cols-9 overflow-hidden border-2 border-slate-700 bg-slate-700" role="grid" aria-label="9 by 9 Sudoku">
        {SUDOKU.map((row, r) => row.map((value, c) => {
          const boxBorder = `${c % 3 === 2 && c < 8 ? "border-r-2 border-r-slate-700" : ""} ${r % 3 === 2 && r < 8 ? "border-b-2 border-b-slate-700" : ""}`;
          return value ? <div key={`${r},${c}`} role="gridcell" className={`grid aspect-square place-items-center border border-slate-300 bg-slate-100 font-bold ${boxBorder}`}>{value}</div> :
            <input key={`${r},${c}`} name={`sudoku_${r}_${c}`} inputMode="numeric" pattern="[1-9]" maxLength={1} aria-label={`Sudoku row ${r + 1}, column ${c + 1}`} className={`aspect-square min-w-0 border border-slate-300 bg-white text-center font-bold text-brand-700 outline-none focus:z-10 focus:bg-brand-50 focus:ring-2 focus:ring-brand-500 ${boxBorder}`} autoComplete="off" />;
        }))}
      </div>
    </section>
    <section aria-labelledby="crossword-title" className="border-t border-slate-100 pt-6">
      <h3 id="crossword-title" className="text-lg font-bold text-ink-900">3. Technical crossword</h3>
      <p className="mb-3 text-sm text-slate-500">Fill the intersecting grid using the across and down clues.</p>
      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        <div className="grid w-fit grid-cols-7 border-2 border-slate-700 bg-slate-700" role="grid" aria-label="Technical crossword">
          {Array.from({ length: 49 }, (_, index) => {
            const r = Math.floor(index / 7), c = index % 7, key = `${r},${c}`;
            if (!CROSSWORD_CELLS.has(key)) return <div key={key} className="h-11 w-11 border border-slate-700 bg-slate-800" aria-hidden="true" />;
            return <div key={key} className="relative h-11 w-11 border border-slate-400 bg-white">
              {CROSSWORD_NUMBERS[key] && <span className="pointer-events-none absolute left-1 top-0 text-[9px] font-bold text-slate-500">{CROSSWORD_NUMBERS[key]}</span>}
              <input name={`crossword_${r}_${c}`} maxLength={1} pattern="[A-Za-z]" aria-label={`Crossword row ${r + 1}, column ${c + 1}`} className="h-full w-full bg-transparent pt-1 text-center text-lg font-black uppercase outline-none focus:bg-brand-50 focus:ring-2 focus:ring-brand-500" autoComplete="off" />
            </div>;
          })}
        </div>
        <div className="space-y-4 text-sm">
          <div><h4 className="font-bold text-ink-900">Across</h4><p><b>1.</b> Instructions a computer can execute (4)</p><p><b>3.</b> Machine intelligence, abbreviated (2)</p></div>
          <div><h4 className="font-bold text-ink-900">Down</h4><p><b>2.</b> Information used for analysis (4)</p></div>
        </div>
      </div>
    </section>
  </div>;
}
