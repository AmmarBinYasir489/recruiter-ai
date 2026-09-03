const PRIMARY_KEYS = [
  "name", "title", "projectName", "role", "jobTitle", "company",
  "institution", "degree", "certification", "description", "summary",
  "details", "url", "link",
] as const;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatObject(value: Record<string, unknown>): string {
  const parts: string[] = [];
  const used = new Set<string>();
  for (const key of PRIMARY_KEYS) {
    const text = formatProfileValue(value[key], "");
    if (text && !parts.includes(text)) parts.push(text);
    used.add(key);
  }
  if (parts.length === 0) {
    for (const [key, item] of Object.entries(value)) {
      if (used.has(key)) continue;
      const text = formatProfileValue(item, "");
      if (text && !parts.includes(text)) parts.push(text);
    }
  }
  return parts.join(" — ");
}

/** Converts both legacy string arrays and structured parser output to readable staff UI text. */
export function formatProfileValue(value: unknown, fallback = "—"): string {
  if (value == null) return fallback;
  if (typeof value === "string") return cleanText(value) || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => formatProfileValue(item, "")).filter(Boolean);
    return items.length ? items.join("; ") : fallback;
  }
  if (typeof value === "object") return formatObject(value as Record<string, unknown>) || fallback;
  return fallback;
}
