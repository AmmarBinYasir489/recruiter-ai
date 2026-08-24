"use client";

import { useMemo, useState } from "react";

type Cell = [number, number];
const WORDS = ["AI", "CODE", "TEAM", "DATA", "TEST"];
const GRID = [
  "AICODELQXZ",
  "TEAMNRUBVK",
  "DATAWPIOGH",
  "TESTYFJCSM",
  "QWERTYUIOP",
  "LKJHGFDSAZ",
  "ZXCVBNMQWE",
  "PLMOKNIJBU",
  "HVGCFXRDZE",
  "SWAQTRBYNU",
].map((row) => row.split(""));

function pathBetween(start: Cell, end: Cell): Cell[] {
  const dr = end[0] - start[0];
  const dc = end[1] - start[1];
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
  const length = Math.max(Math.abs(dr), Math.abs(dc));
  return Array.from({ length: length + 1 }, (_, index) => [start[0] + Math.sign(dr) * index, start[1] + Math.sign(dc) * index]);
}

const key = ([row, col]: Cell) => `${row},${col}`;

export function WordSearchAssessment() {
  const [start, setStart] = useState<Cell | null>(null);
  const [found, setFound] = useState<Record<string, Cell[]>>({});
  const [message, setMessage] = useState("Select the first and last letter of a word.");
  const foundCells = useMemo(() => new Set(Object.values(found).flat().map(key)), [found]);

  function choose(cell: Cell) {
    if (!start) {
      setStart(cell);
      setMessage("Now select the last letter.");
      return;
    }
    const path = pathBetween(start, cell);
    const letters = path.map(([row, col]) => GRID[row][col]).join("");
    const word = WORDS.find((candidate) => candidate === letters || candidate === letters.split("").reverse().join(""));
    if (word && !found[word]) {
      setFound((current) => ({ ...current, [word]: path }));
      setMessage(`${word} found.`);
    } else {
      setMessage("That line is not a remaining word. Try again.");
    }
    setStart(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
      <div>
        <p className="mb-3 text-sm text-slate-600" aria-live="polite">{message}</p>
        <div role="grid" aria-label="Word search board" className="mx-auto grid w-fit grid-cols-10 gap-1 rounded-xl bg-slate-700 p-1.5">
          {GRID.map((row, rowIndex) => row.map((letter, colIndex) => {
            const cell: Cell = [rowIndex, colIndex];
            const selected = start && key(start) === key(cell);
            const isFound = foundCells.has(key(cell));
            return (
              <button
                key={key(cell)}
                type="button"
                role="gridcell"
                aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, letter ${letter}`}
                aria-selected={Boolean(selected || isFound)}
                onClick={() => choose(cell)}
                className={`grid h-8 w-8 place-items-center rounded text-sm font-black sm:h-10 sm:w-10 ${selected ? "bg-brand-300" : isFound ? "bg-emerald-300" : "bg-white text-ink-900 hover:bg-brand-50"}`}
              >
                {letter}
              </button>
            );
          }))}
        </div>
      </div>
      <div>
        <h3 className="font-bold text-ink-900">Words</h3>
        <p className="text-xs text-slate-500">Found {Object.keys(found).length} of {WORDS.length}</p>
        <ul className="mt-3 space-y-2">
          {WORDS.map((word, index) => (
            <li key={word} className={`text-sm font-semibold ${found[word] ? "text-emerald-600 line-through" : "text-slate-600"}`}>
              {found[word] ? "✓ " : ""}{word}
              {found[word] && <input type="hidden" name={`w${index + 1}`} value="1" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
