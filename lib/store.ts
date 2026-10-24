import type { RunResult } from "./types";

const globalStore = globalThis as typeof globalThis & { __proofRuns?: Map<string, RunResult> };
if (!globalStore.__proofRuns) globalStore.__proofRuns = new Map();

export const runs = globalStore.__proofRuns;

export function saveRun(result: RunResult) {
  runs.set(result.id, result);
  if (runs.size > 40) {
    const oldest = [...runs.keys()][0];
    if (oldest) runs.delete(oldest);
  }
}
