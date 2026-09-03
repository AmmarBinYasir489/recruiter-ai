"use client";

import { useEffect, useMemo, useState } from "react";
import { pathBetween, validateWordPaths, type Cell, type WordSearchPuzzle } from "@/lib/games/wordSearch";
const cellKey = ([row, col]: Cell) => `${row},${col}`;

export function WordSearchAssessment({ puzzle, attemptId }: { puzzle: WordSearchPuzzle; attemptId: string }) {
  const [start, setStart] = useState<Cell | null>(null);
  const [found, setFound] = useState<Record<string, Cell[]>>({});
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Select the first and last letter. Words can run in all eight directions.");
  const foundCells = useMemo(() => new Set(Object.values(found).flat().map(cellKey)), [found]);
  const storageKey = `word-search:${attemptId}:v2`;
  useEffect(() => {
    try { setFound(validateWordPaths(puzzle, JSON.parse(sessionStorage.getItem(storageKey) || "[]"))); } catch { /* Browser storage may be unavailable. */ }
    setReady(true);
  }, [puzzle, storageKey]);
  useEffect(() => { if (ready) try { sessionStorage.setItem(storageKey, JSON.stringify(Object.values(found))); } catch { /* Server validates submission regardless. */ } }, [found, ready, storageKey]);
  function choose(cell: Cell) {
    if (!start) { setStart(cell); setMessage("Now select the last letter."); return; }
    const matches = validateWordPaths(puzzle, [pathBetween(start, cell)]);
    const word = Object.keys(matches)[0];
    if (word && !found[word]) { setFound((current) => ({ ...current, ...matches })); setMessage(`${word} found.`); }
    else setMessage("That line is not a remaining word. Try again.");
    setStart(null);
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px]">
    <input type="hidden" name="wordSearchPaths" value={JSON.stringify(Object.values(found))} />
    <div>
      <p className="mb-3 text-sm text-slate-600" role="status">{message}</p>
      <div aria-label="Word search board" className="mx-auto grid w-full max-w-md grid-cols-10 gap-px rounded-xl bg-slate-700 p-0.5 sm:gap-1 sm:p-1.5">
        {puzzle.grid.map((row, r) => row.map((letter, c) => {
          const selected = Boolean(start && cellKey(start) === cellKey([r, c]));
          const isFound = foundCells.has(cellKey([r, c]));
          return <button key={`${r},${c}`} type="button" aria-label={`Row ${r + 1}, column ${c + 1}, letter ${letter}`} aria-pressed={selected || isFound}
            onClick={() => choose([r, c])} className={`grid aspect-square min-w-0 w-full place-items-center rounded text-sm font-black ${selected ? "bg-brand-300" : isFound ? "bg-emerald-300" : "bg-white text-ink-900 hover:bg-brand-50"}`}>{letter}</button>;
        }))}
      </div>
    </div>
    <div><h4 className="font-bold text-ink-900">Words</h4><p className="text-sm text-slate-600">Found {Object.keys(found).length} of {puzzle.words.length}</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">{puzzle.words.map((word) => <li key={word} className={`text-sm font-semibold ${found[word] ? "text-emerald-700 line-through" : "text-slate-600"}`}>{found[word] ? "✓ " : ""}{word}</li>)}</ul>
    </div>
  </div>;
}
