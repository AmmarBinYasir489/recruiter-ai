export type Cell = [number, number];
export type WordSearchPuzzle = { version: 2; grid: string[][]; words: string[] };
const BANK = ["LOGIC", "VECTOR", "SEARCH", "SYSTEM", "MEMORY", "PATTERN", "MODEL", "FOCUS", "SIGNAL", "METHOD", "REASON", "DESIGN", "LEARN", "SOLVE", "ORDER", "TRACE"];
const DIRECTIONS: Cell[] = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
function random(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state += 0x6d2b79f5; let t = Math.imul(state ^ state >>> 15, 1 | state); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle<T>(values: T[], next: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function generateWordSearch(attemptId: string): WordSearchPuzzle {
  const next = random(`word-search-v2:${attemptId}`), words = shuffle(BANK, next).slice(0, 8);
  for (let retry = 0; retry < 100; retry++) {
    const grid = Array.from({ length: 10 }, () => Array<string>(10).fill("")), directions = shuffle(DIRECTIONS, next);
    let placed = true;
    for (let i = 0; i < words.length; i++) {
      const word = words[i], [dr, dc] = directions[i], positions: Cell[] = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const endR = r + dr * (word.length - 1), endC = c + dc * (word.length - 1);
        if (endR < 0 || endR >= 10 || endC < 0 || endC >= 10) continue;
        const quadrant = ((r + endR) / 2 >= 5 ? 2 : 0) + ((c + endC) / 2 >= 5 ? 1 : 0);
        if (quadrant !== i % 4) continue;
        if ([...word].every((letter, n) => !grid[r + dr * n][c + dc * n] || grid[r + dr * n][c + dc * n] === letter)) positions.push([r, c]);
      }
      if (!positions.length) { placed = false; break; }
      const [r, c] = positions[Math.floor(next() * positions.length)];
      [...word].forEach((letter, n) => { grid[r + dr * n][c + dc * n] = letter; });
    }
    if (placed) return { version: 2, words, grid: grid.map((row) => row.map((letter) => letter || String.fromCharCode(65 + Math.floor(next() * 26)))) };
  }
  throw new Error("Could not prepare the word-search puzzle. Please retry.");
}
export function pathBetween(start: Cell, end: Cell): Cell[] {
  const dr = end[0] - start[0], dc = end[1] - start[1];
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
  const length = Math.max(Math.abs(dr), Math.abs(dc));
  if (length > 9) return [];
  return Array.from({ length: length + 1 }, (_, i) => [start[0] + Math.sign(dr) * i, start[1] + Math.sign(dc) * i]);
}
export function validateWordPaths(puzzle: WordSearchPuzzle, value: unknown): Record<string, Cell[]> {
  if (!Array.isArray(value)) return {};
  const found: Record<string, Cell[]> = {};
  for (const path of value.slice(0, 16)) {
    if (!Array.isArray(path) || path.length < 2 || path.length > 10) continue;
    if (!path.every((cell) => Array.isArray(cell) && cell.length === 2 && cell.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 10))) continue;
    const cells = path as Cell[];
    if (JSON.stringify(pathBetween(cells[0], cells[cells.length - 1])) !== JSON.stringify(cells)) continue;
    const letters = cells.map(([r, c]) => puzzle.grid[r][c]).join("");
    const word = puzzle.words.find((item) => item === letters || item === [...letters].reverse().join(""));
    if (word) found[word] = cells;
  }
  return found;
}
