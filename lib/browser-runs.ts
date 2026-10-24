import type { RunResult } from "./types";

function key(id: string) {
  return `proofengine-run:${id}`;
}

export function rememberRun(run: RunResult) {
  try {
    sessionStorage.setItem(key(run.id), JSON.stringify(run));
  } catch {
    // The brief still opens from the in-memory API when this browser cannot store it.
  }
}

export function readRun(id: string): RunResult | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return null;
    const run = JSON.parse(raw) as RunResult;
    if (!run || run.id !== id || typeof run.sendable !== "boolean") return null;
    return run;
  } catch {
    return null;
  }
}
