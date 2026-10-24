export const PROCESS_PATTERNS: { id: string; label: string; re: RegExp }[] = [
  {
    id: "manual",
    label: "Manual work, in the ad's words",
    re: /manuaalisesti|manuaalinen|käsin syöt|käsin kirj|käsin teht/i,
  },
  {
    id: "between-systems",
    label: "Work between systems",
    re: /järjestelmien välillä|järjestelmästä toiseen|useista järjestelmistä/i,
  },
  {
    id: "data-entry",
    label: "Data entry",
    re: /tietojen syött|tiedon syött|tietojen kirj|data entry/i,
  },
  {
    id: "copy",
    label: "Copying data by hand",
    re: /copy-paste|kopioi ja liitä|kopioidaan tiedot/i,
  },
];

export const TOOL_PATTERNS: { id: string; label: string; re: RegExp }[] = [
  { id: "excel", label: "Excel", re: /\bexcel\b/i },
  { id: "powerbi", label: "Power BI", re: /\bpower\s*bi\b/i },
  { id: "sheets", label: "Spreadsheets", re: /taulukkolaske/i },
];

export const STAFFING_AGENCIES = [
  "academic work",
  "barona",
  "eezy",
  "adecco",
  "staffpoint",
  "manpower",
  "eilakaisla",
  "opteam",
  "carrot",
  "vmp",
  "go on",
  "personalhuset",
  "sol henkilosto",
  "bolt.works",
  "studentwork",
  "aalto university executive education",
];

export function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function textIncludes(haystack: string, quote: string): boolean {
  return normalizeSpace(haystack).includes(normalizeSpace(quote));
}

function cleanLine(value: string): string {
  return normalizeSpace(value.replace(/^[\s•*\-–—]+/, ""));
}

export function acceptableQuote(quote: string): boolean {
  if (quote.length < 40 || quote.length > 320) return false;
  return /^[A-ZÄÖÅ0-9"«]/.test(quote);
}

export function findQuote(description: string, re: RegExp): string | null {
  const match = description.match(re);
  if (!match || match.index === undefined) return null;
  const lineStart = description.lastIndexOf("\n", match.index) + 1;
  const lineEndIndex = description.indexOf("\n", match.index);
  const lineEnd = lineEndIndex === -1 ? description.length : lineEndIndex;
  const line = cleanLine(description.slice(lineStart, lineEnd));
  if (acceptableQuote(line)) return line;

  const sentences = description.slice(lineStart, lineEnd).split(/(?<=[.!?])\s+/);
  let cursor = lineStart;
  for (const sentence of sentences) {
    const start = cursor;
    const end = cursor + sentence.length;
    cursor = end + 1;
    if (match.index < start || match.index >= end) continue;
    const cleaned = cleanLine(sentence);
    if (acceptableQuote(cleaned)) return cleaned;
  }
  return null;
}
