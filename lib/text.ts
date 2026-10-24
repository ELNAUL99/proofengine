const LEGAL = new Set(["oyj", "oy", "ab", "kb", "ky", "ry", "osk", "ay"]);

export function fold(value: string): string {
  return value
    .toLocaleLowerCase("fi")
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replaceAll("å", "a")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coreName(value: string): string {
  const parts = fold(value).split(" ").filter(Boolean);
  while (parts.length > 1 && LEGAL.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

export function tokens(value: string): string[] {
  return coreName(value).split(" ").filter((part) => part.length > 1);
}

export function containsPhrase(haystack: string, needle: string): boolean {
  const hay = tokens(haystack);
  const need = tokens(needle);
  if (need.length === 0 || hay.length === 0) return false;
  for (let i = 0; i <= hay.length - need.length; i++) {
    if (need.every((part, offset) => hay[i + offset] === part)) return true;
  }
  return false;
}

/** Same employer, not a longer legal name that merely shares a first word. */
export function sameEmployer(publishedName: string, officialName: string): boolean {
  const published = tokens(publishedName);
  const official = tokens(officialName);
  if (published.length === 0 || official.length === 0) return false;
  if (published.join(" ") === official.join(" ")) return true;
  if (official.length >= 2 && containsPhrase(publishedName, officialName)) return true;
  return false;
}

export function decodeText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function quoteLanguage(value: string): "fi" | "en" {
  if (/[äöåÄÖÅ]/.test(value)) return "fi";
  const hits = value
    .toLocaleLowerCase("fi")
    .match(/\b(ja|että|tai|sekä|ovat|työ|kanssa|ilmoitus|osaamista|vahvaa)\b/g);
  return hits && hits.length >= 2 ? "fi" : "en";
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function formatFiDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fi-FI", { dateStyle: "medium" }).format(date);
}

export async function fetchText(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<{ status: number; text: string; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "ProofEngine/1.0 (Velho hackathon demo; public company data)",
        Accept: "application/json, text/html;q=0.8",
        ...init.headers,
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
