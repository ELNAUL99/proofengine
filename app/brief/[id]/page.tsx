"use client";

import { useEffect, useState } from "react";
import { FitView } from "../../fit-view";
import { RefusalView } from "../../refusal-view";
import { readRun } from "@/lib/browser-runs";
import type { RunResult } from "@/lib/types";

export default function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const [result, setResult] = useState<RunResult | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { id } = await params;
      const cached = readRun(id);
      if (cached) {
        if (!cancelled) setResult(cached);
        return;
      }
      try {
        const response = await fetch(`/api/runs/${id}`);
        if (!response.ok) throw new Error("missing");
        const run = (await response.json()) as RunResult;
        if (!cancelled) setResult(run);
      } catch {
        if (!cancelled) setResult(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (result === undefined) {
    return (
      <main className="brief">
        <p className="eyebrow">ProofEngine</p>
        <h1>Opening the brief</h1>
      </main>
    );
  }

  if (!result || !result.sendable || !result.email) {
    return (
      <main className="brief">
        <p className="eyebrow">ProofEngine</p>
        <h1>No brief</h1>
        <p>A brief is created only when there is an email to send.</p>
        <p className="back"><a href="/">Back to the search</a></p>
      </main>
    );
  }

  const finding = result.findings[0];
  return (
    <main className="brief">
      <p className="back"><a href="/">Back to the search</a></p>
      <p className="eyebrow">Public sources · {new Date(result.createdAt).toLocaleString("fi-FI")}</p>
      <h1>Notes on {result.company.name}</h1>
      <p>
        Prepared from the Finnish trade register and public job ads. This page does not estimate a saving and does not claim a meeting.
      </p>

      {result.refusals?.length ? <RefusalView refusals={result.refusals} /> : null}

      {result.fit ? <FitView fit={result.fit} prospect /> : null}

      <section>
        <h2>The company</h2>
        <dl className="fact">
          <dt>Name</dt>
          <dd>{result.company.name}</dd>
          <dt>Business ID</dt>
          <dd className="id">{result.company.businessId}</dd>
          <dt>Form</dt>
          <dd>{result.company.form || "—"}</dd>
          <dt>Industry</dt>
          <dd>{result.company.industry || "—"} {result.company.industryCode ? `(${result.company.industryCode})` : ""}</dd>
          <dt>City</dt>
          <dd>{result.company.city || "—"}</dd>
          <dt>Address</dt>
          <dd>{result.company.address || "—"}</dd>
          <dt>Status</dt>
          <dd>{result.company.active ? "Active in the register" : "Not active"}</dd>
        </dl>
      </section>

      <section>
        <h2>What we would send</h2>
        <article lang={result.emailLang || "fi"}>
          <p><strong>Subject:</strong> {result.subject}</p>
          <pre>{result.email}</pre>
        </article>
        {result.gloss ? (
          <div className="gloss" lang={result.glossLang || "en"}>
            <p className="meta">Translation for the room. This is not a second email.</p>
            <pre>{result.gloss}</pre>
          </div>
        ) : null}
      </section>

      {finding ? (
        <section>
          <h2>The sentence</h2>
          <p>{finding.reading}</p>
          {finding.evidence.map((item) => (
            <blockquote key={item.url} lang="fi">«{item.quote}»</blockquote>
          ))}
          <p>
            <a href={finding.evidence[0]?.url}>{finding.evidence[0]?.jobTitle}</a>
            {finding.evidence[0]?.posted ? ` · ${finding.evidence[0].posted}` : ""}
            {finding.evidence[0]?.viaStaffingAgency ? ` · Advertiser: ${finding.evidence[0].advertiser}` : ""}
          </p>
          <p className="meta">{finding.service}</p>
        </section>
      ) : null}

      <section>
        <h2>Ads read</h2>
        <p className="meta">{result.sources.adsNamed} named this legal entity. {result.sources.adsRead} full descriptions were read.</p>
        {result.jobs.map((job) => (
          <p key={job.id}>
            <a href={job.url}>{job.title}</a>
            {" · "}{job.companyName}{job.posted ? ` · ${job.posted}` : ""}
            {job.salaryLabel ? ` · Pay stated in the ad: ${job.salaryLabel}` : ""}
          </p>
        ))}
      </section>

      <section>
        <p>Velho Applied Intelligence builds automations and internal tools. <a href="https://velho.io">velho.io</a></p>
        <p className="back"><a href="/">Back to the search</a></p>
      </section>
    </main>
  );
}
