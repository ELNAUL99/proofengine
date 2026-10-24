"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FitView } from "./fit-view";
import { RefusalView } from "./refusal-view";
import { readRun, rememberRun } from "@/lib/browser-runs";
import { DEFAULT_GUESS, SEATS, SHOWCASES } from "@/lib/refusals";
import type { CompanyCandidate, RunResult } from "@/lib/types";

const EXAMPLES = ["Broman Group"];
const SEARCH_KEY = "proofengine-last-search";

type SavedSearch = {
  query: string;
  candidates: CompanyCandidate[];
  selectedId: string | null;
  runId: string | null;
};

function readSearch(): SavedSearch | null {
  try {
    const raw = sessionStorage.getItem(SEARCH_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedSearch;
    if (!saved || typeof saved.query !== "string" || !Array.isArray(saved.candidates)) return null;
    return saved;
  } catch {
    return null;
  }
}

function rememberSearch(patch: Partial<SavedSearch>) {
  const current = readSearch() || { query: "", candidates: [], selectedId: null, runId: null };
  sessionStorage.setItem(SEARCH_KEY, JSON.stringify({ ...current, ...patch }));
}

const STAGES: Record<string, string> = {
  registry: "Resolving the company in the trade register.",
  jobs: "Searching Duunitori for ads that name this company.",
  read: "Reading the full ad text.",
  redteam: "Asking Claude what would get the email deleted.",
};

type ResolveResponse = {
  candidates: CompanyCandidate[];
  auto: CompanyCandidate | null;
  fromCache: boolean;
  error?: string;
};

export default function Console() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "resolving" | "choose" | "running" | "done">("idle");
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<CompanyCandidate[]>([]);
  const [selected, setSelected] = useState<CompanyCandidate | null>(null);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [seatGuess, setSeatGuess] = useState(DEFAULT_GUESS.seat);
  const [showcaseGuess, setShowcaseGuess] = useState(DEFAULT_GUESS.showcase);
  const [apiKey, setApiKey] = useState("");
  const [mistralKey, setMistralKey] = useState("");
  const [showGloss, setShowGloss] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = readSearch();
    if (!saved || saved.candidates.length === 0) return;
    setQuery(saved.query);
    setCandidates(saved.candidates);
    setSelected(saved.candidates.find((candidate) => candidate.businessId === saved.selectedId) || null);
    if (!saved.runId) {
      setPhase("choose");
      return;
    }
    const cached = readRun(saved.runId);
    if (cached) {
      setResult(cached);
      setPhase("done");
      return;
    }
    let cancelled = false;
    void fetch(`/api/runs/${saved.runId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("missing");
        return (await response.json()) as RunResult;
      })
      .then((run) => {
        if (cancelled) return;
        setResult(run);
        setPhase("done");
      })
      .catch(() => {
        if (!cancelled) setPhase("choose");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const others = useMemo(
    () => (result ? result.jobs.filter((job) => !result.findings.some((finding) => finding.evidence.some((item) => item.jobId === job.id))) : []),
    [result],
  );

  async function lookup(nextQuery = query) {
    const cleaned = nextQuery.trim();
    if (cleaned.length < 2) return;
    setQuery(cleaned);
    setPhase("resolving");
    setError("");
    setResult(null);
    setSelected(null);
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleaned }),
      });
      const payload = (await response.json()) as ResolveResponse;
      if (!response.ok || payload.error) throw new Error(payload.error || "Lookup failed.");
      setCandidates(payload.candidates);
      rememberSearch({
        query: cleaned,
        candidates: payload.candidates,
        selectedId: payload.auto?.businessId ?? null,
        runId: null,
      });
      if (payload.candidates.length === 0) {
        setPhase("idle");
        setError("No trade-register company matched that name.");
        return;
      }
      if (payload.auto) {
        setSelected(payload.auto);
        await run(payload.auto);
        return;
      }
      setPhase("choose");
    } catch (caught) {
      setPhase("idle");
      setError(caught instanceof Error ? caught.message : "Lookup failed.");
    }
  }

  async function run(company: CompanyCandidate) {
    setSelected(company);
    setPhase("running");
    setStage(STAGES.registry);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: company.businessId,
          anthropicKey: apiKey,
          guess: { seat: seatGuess, showcase: showcaseGuess },
        }),
      });
      if (!response.ok || !response.body) throw new Error(`Run failed (${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const event = part.match(/^event: (.+)$/m)?.[1];
          const raw = part.match(/^data: ([\s\S]+)$/m)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw) as { id?: string; message?: string; adsNamed?: number; adsRead?: number };
          if (event === "stage") {
            const label = STAGES[data.id || ""] || "Working.";
            setStage(data.adsNamed != null ? `${label} ${data.adsNamed} named, reading ${data.adsRead}.` : label);
          } else if (event === "error") {
            throw new Error(data.message || "The run failed.");
          } else if (event === "done") {
            const run = data as RunResult;
            rememberRun(run);
            setResult(run);
            setPhase("done");
            rememberSearch({ selectedId: company.businessId, runId: run.id });
          }
        }
      }
    } catch (caught) {
      setPhase("choose");
      setError(caught instanceof Error ? caught.message : "The run failed.");
    }
  }

  async function copyEmail() {
    if (!result?.email) return;
    await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.email}`);
    setCopied(true);
  }

  return (
    <main className="shell">
      <header className="mast">
        <div>
          <p className="eyebrow">Velho · live demo</p>
          <h1>ProofEngine</h1>
          <p className="lede">A company name in. A sentence from their own job ad, or no email.</p>
        </div>
        <p className="small">PRH trade register and Duunitori public ads. No contact details. No estimated saving.</p>
      </header>

      <form
        className="search"
        onSubmit={(event) => {
          event.preventDefault();
          void lookup();
        }}
      >
        <input
          aria-label="Company name or business ID"
          placeholder="Company name or Y-tunnus"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="primary" type="submit" disabled={phase === "resolving" || phase === "running"}>
          {phase === "resolving" ? "Looking up…" : "Look up"}
        </button>
      </form>
      <div className="examples">
        <span>Live examples</span>
        {EXAMPLES.map((example) => (
          <button key={example} className="chip" type="button" onClick={() => void lookup(example)}>
            {example}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}

      <div className="layout">
        <aside className="stack">
          <section className="panel guess">
            <h2>What you would have sent</h2>
            <p className="meta">The usual move is the CEO and Kreia. The sentence can overturn both.</p>
            <label>
              Seat
              <select value={seatGuess} onChange={(event) => setSeatGuess(event.target.value)} disabled={phase === "resolving" || phase === "running"}>
                {SEATS.map((item) => (
                  <option key={item.seat} value={item.seat}>{item.seat}</option>
                ))}
              </select>
            </label>
            <label>
              Example
              <select value={showcaseGuess} onChange={(event) => setShowcaseGuess(event.target.value)} disabled={phase === "resolving" || phase === "running"}>
                {SHOWCASES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </section>
          <section className="panel">
            <h2>Company</h2>
            {candidates.length === 0 ? <p className="meta">Search returns the register match before any ad is read.</p> : null}
            {candidates.map((candidate) => (
              <button
                key={candidate.businessId}
                className={selected?.businessId === candidate.businessId ? "candidate on" : "candidate"}
                type="button"
                onClick={() => void run(candidate)}
              >
                <strong>{candidate.name}</strong>
                <span className="id">{candidate.businessId}</span>
                <span className="meta">
                  {candidate.active ? "Active" : "Not active"} · {candidate.city || "City unknown"} · {candidate.reason}
                </span>
              </button>
            ))}
          </section>
          <section className="panel key">
            <h2>Red-team</h2>
            <p className="meta">Optional. Claude names objections. It does not score a reply probability. Leave this empty and the draft still stands.</p>
            <input
              type="password"
              aria-label="Anthropic API key"
              placeholder="Anthropic API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
            />
          </section>
          <section className="panel key">
            <h2>Follow-up</h2>
            <p className="meta">Optional. Mistral answers one question about the grade, using only that run. Leave this empty and the grade still stands.</p>
            <input
              type="password"
              aria-label="Mistral API key"
              placeholder="Mistral API key"
              value={mistralKey}
              onChange={(event) => setMistralKey(event.target.value)}
              autoComplete="off"
            />
          </section>
        </aside>

        <section>
          {phase === "running" ? <p className="stage">{stage}</p> : null}
          {result ? (
            <>
              <ResultView result={result} others={others} showGloss={showGloss} copied={copied} onToggleGloss={() => setShowGloss((value) => !value)} onCopy={() => void copyEmail()} />
              <AskGrade result={result} mistralKey={mistralKey} />
            </>
          ) : null}
          {phase === "idle" && !result ? (
            <section className="panel">
              <h2>What a run will do</h2>
              <p>Resolve one legal entity. Read ads that name that entity. Quote a sentence about manual work, Excel, Power BI, or spreadsheets. Write the email from that sentence.</p>
              <p className="meta">If the ads do not contain a sentence we can send, the run stops. No email, no brief.</p>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function AskGrade({ result, mistralKey }: { result: RunResult; mistralKey: string }) {
  const [question, setQuestion] = useState("Why is this the grade, and what should Velho do next?");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mistralKey, result }),
      });
      const payload = (await response.json()) as { answer?: string; model?: string; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error || "The follow-up failed.");
      setAnswer(payload.answer);
      setModel(payload.model || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The follow-up failed. The grade still stands.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel ask">
      <h2>Ask about this grade</h2>
      <p className="meta">One question. The answer can only use this run. It does not change the grade or the red-team.</p>
      <form onSubmit={(event) => void ask(event)}>
        <textarea
          aria-label="Question about this grade"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
        />
        <button className="primary" type="submit" disabled={pending || question.trim().length < 2}>
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
      {answer ? (
        <div>
          <p>{answer}</p>
          {model ? <p className="meta">{model}. Not a new grade.</p> : null}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

function ResultView({
  result,
  others,
  showGloss,
  copied,
  onToggleGloss,
  onCopy,
}: {
  result: RunResult;
  others: RunResult["jobs"];
  showGloss: boolean;
  copied: boolean;
  onToggleGloss: () => void;
  onCopy: () => void;
}) {
  if (!result.sendable) {
    return (
      <div className="banner hold">
        <h2>No email</h2>
        <p>
          {result.company.name} · <span className="id">{result.company.businessId}</span>
        </p>
        <p>No sentence we can send, so there is no brief.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="banner ready">
        <h2>Draft ready</h2>
        <p>
          {result.company.name} · <span className="id">{result.company.businessId}</span>
          {result.company.city ? ` · ${result.company.city}` : ""} · {result.company.industry || "Industry not listed"}
        </p>
        <p>{result.subject}</p>
        <p className="meta">
          {result.sources.adsNamed} ads named this company. {result.sources.adsRead} descriptions read.
          {result.sources.fromCache ? " Served from this session's fetch." : ""}
        </p>
        <p><a href={`/brief/${result.id}`}>Open the brief</a></p>
      </div>

      {result.refusals?.length ? <RefusalView refusals={result.refusals} /> : null}

      {result.fit ? <FitView fit={result.fit} /> : null}

      {result.email ? (
        <article className="email-card" lang={result.emailLang || "fi"}>
          <div className="row">
            <h2>Email we would send</h2>
            <button className="ghost" type="button" onClick={onCopy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="meta">Subject: {result.subject}</p>
          <pre>{result.email}</pre>
          {result.gloss ? (
            <div className="gloss">
              <button className="text" type="button" onClick={onToggleGloss}>
                {showGloss ? "Hide translation" : "Show translation for the room"}
              </button>
              {showGloss ? <pre lang={result.glossLang || "en"}>{result.gloss}</pre> : null}
            </div>
          ) : null}
          <p><a href={`/brief/${result.id}`}>Open the brief</a></p>
        </article>
      ) : null}

      {result.findings.map((finding) => (
        <article key={finding.id} className="quote">
          <span className="tag">{finding.kind === "process" ? "Process" : "Tool named"}</span>
          <h2>{finding.headline}</h2>
          <p>{finding.reading}</p>
          {finding.evidence.map((item) => (
            <blockquote key={item.quote} lang="fi">«{item.quote}»</blockquote>
          ))}
          <p className="meta">
            {finding.evidence[0]?.jobTitle} · {finding.evidence[0]?.posted} ·{" "}
            <a href={finding.evidence[0]?.url}>Source ad</a>
            {finding.evidence[0]?.viaStaffingAgency ? ` · Staffing ad by ${finding.evidence[0].advertiser}` : ""}
          </p>
          <p className="meta">{finding.service}</p>
        </article>
      ))}

      <section className="panel">
        <h2>Checks</h2>
        {result.checks.map((check) => (
          <p key={check.id} className="check">
            <span className={`tag ${check.status}`}>{check.status}</span>
            <span>{check.text}</span>
          </p>
        ))}
        {result.redteam ? (
          <div>
            <h3>Model red-team</h3>
            <p>{result.redteam.killLine}</p>
            <ul>
              {result.redteam.objections.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="meta">{result.redteam.model}. Not a reply probability.</p>
          </div>
        ) : null}
        {result.redteamError ? <p className="error">{result.redteamError}</p> : null}
      </section>

      {others.length > 0 ? (
        <section className="panel">
          <h2>Other ads read</h2>
          <p className="meta">These named the company and did not contain a quotable process or tool sentence.</p>
          {others.map((job) => (
            <article key={job.id} className="ad">
              <strong>{job.title}</strong>
              <p className="meta">
                {job.companyName} · {job.municipality} · {job.posted}
                {job.salaryLabel ? ` · Pay in the ad: ${job.salaryLabel}` : ""}
                {job.viaStaffingAgency ? ` · via ${job.advertiser}` : ""}
              </p>
              <a href={job.url}>Open ad</a>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
