import raw from "../data/suggestions.json";
import type { RunResult } from "./types";

export const suggestions = (raw as RunResult[]).filter(
  (run) => run.sendable && !!run.email && run.findings.some((finding) => finding.evidence.some((item) => item.quote.length >= 40)),
);

export function suggestionById(id: string): RunResult | null {
  return suggestions.find((run) => run.id === id) || null;
}
