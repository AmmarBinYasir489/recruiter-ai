export function cleanSkills(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : [];
  return [...new Set(values.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase()).filter((item) => item.length >= 2 && item.length <= 80))].slice(0, 30);
}

// Conservative role vocabulary for evidence matching, not automatic requirements.
export function roleTerms(title = ""): string[] {
  if (/web|front.?end|full.?stack/i.test(title)) return ["web", "website", "frontend", "react", "html", "css", "javascript", "typescript", "next.js", "node.js"];
  if (/\bai\b|artificial intelligence|machine learning/i.test(title)) return ["machine learning", "deep learning", "nlp", "pytorch", "tensorflow", "llm", "computer vision", "artificial intelligence"];
  if (/data/i.test(title)) return ["data analysis", "data science", "sql", "pandas", "statistics", "analytics", "machine learning"];
  if (/back.?end/i.test(title)) return ["backend", "api", "database", "node.js", "django", "fastapi", "spring"];
  if (/electr|circuit|embedded/i.test(title)) return ["circuit", "electronics", "embedded", "verilog", "fpga", "microcontroller"];
  if (/account|financ/i.test(title)) return ["accounting", "finance", "bookkeeping", "audit", "tax"];
  return [];
}

export function evidenceMatches(text: string, terms: string[]) {
  return terms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
  });
}
