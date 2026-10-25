import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { audit, buildFindings, composeEmail, emailWordCount } from "../lib/analyze";
import { buildFit } from "../lib/fit";
import { collectJobs } from "../lib/jobs";
import { PROCESS_PATTERNS, STAFFING_AGENCIES, TOOL_PATTERNS } from "../lib/patterns";
import { resolveCompany } from "../lib/prh";
import { buildRefusals, normalizeGuess } from "../lib/refusals";
import type { JobAd, RunResult } from "../lib/types";
import { fold, sameEmployer } from "../lib/text";

const SEARCH = "https://duunitori.fi/api/v1/jobentries?search=";
const PATTERNS = [...PROCESS_PATTERNS, ...TOOL_PATTERNS];
const QUERIES = ["Power BI", "Excel", "manuaalisesti", "taulukkolaskenta"];

type Hit = { company: string; title: string };

function isAgency(name: string): boolean {
  const folded = fold(name);
  return STAFFING_AGENCIES.some((agency) => folded.includes(fold(agency)));
}

function mentioned(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.re.test(text));
}

async function discover(): Promise<Hit[]> {
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const query of QUERIES) {
    for (let page = 1; page <= 2; page += 1) {
      const response = await fetch(`${SEARCH}${encodeURIComponent(query)}&page=${page}`);
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        results?: { company_name?: string; heading?: string; descr?: string }[];
      };
      for (const job of payload.results || []) {
        const company = (job.company_name || "").trim();
        if (!company || isAgency(company)) continue;
        const blob = `${job.heading || ""} ${job.descr || ""}`;
        if (!mentioned(blob)) continue;
        const key = fold(company);
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ company, title: job.heading || "" });
      }
    }
  }
  return hits.slice(0, 8);
}

function slimJob(job: JobAd): JobAd {
  return { ...job, description: "" };
}

async function researchOne(name: string): Promise<RunResult | null> {
  const resolved = await resolveCompany(name);
  const matches = resolved.candidates.filter((candidate) =>
    candidate.matchNames.some((official) => sameEmployer(name, official) || sameEmployer(official, name)),
  );
  const pool = matches.length > 0 ? matches : resolved.candidates;
  if (pool.length !== 1) {
    console.log(`skip ${name}: ${pool.length} register matches`);
    for (const candidate of pool) console.log(`  ${candidate.businessId} ${candidate.name} ${candidate.score}`);
    return null;
  }
  const company = pool[0];
  const collected = await collectJobs(company);
  const findings = buildFindings(collected.jobs);
  const id = `ready-${company.businessId}`;
  const briefUrl = `https://proofengine-kappa.vercel.app/brief/${id}`;
  const drafted = composeEmail(company, findings, briefUrl);
  const checks = audit(drafted.email, collected.jobs, findings);
  const blocked = checks.find((check) => check.status === "block");
  const sendable = drafted.sendable && !blocked;
  if (!sendable) {
    console.log(`stop ${company.name}: ${blocked?.text || drafted.withholdReason}`);
    return null;
  }
  const fit = buildFit(company, findings);
  if (!fit) return null;
  const quote = findings[0]?.evidence[0]?.quote || "";
  console.log(`keep ${company.name} ${company.businessId} ${fit.seat} | ${quote.slice(0, 90)}`);
  const result: RunResult = {
    id,
    createdAt: new Date().toISOString(),
    company,
    sources: {
      jobs: "ok",
      searchedQueries: collected.searchedQueries,
      adsNamed: collected.adsNamed,
      adsRead: collected.jobs.length,
      fromCache: false,
    },
    jobs: collected.jobs.map(slimJob),
    findings,
    sendable: true,
    withholdReason: null,
    subject: drafted.subject,
    email: drafted.email,
    emailLang: drafted.emailLang,
    gloss: drafted.gloss,
    glossLang: drafted.glossLang,
    emailWords: emailWordCount(drafted.email),
    checks,
    fit,
    guess: normalizeGuess(null),
    refusals: buildRefusals(fit, null),
    redteam: null,
    redteamError: null,
  };
  return result;
}

async function main() {
  const hits = await discover();
  console.log(`discovered ${hits.length}`);
  for (const hit of hits) console.log(`- ${hit.company} | ${hit.title}`);

  const kept: RunResult[] = [];
  for (const hit of hits) {
    try {
      const result = await researchOne(hit.company);
      if (result) kept.push(result);
    } catch (error) {
      console.log(`error ${hit.company}: ${error instanceof Error ? error.message : "failed"}`);
    }
    if (kept.length >= 4) break;
  }

  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "suggestions.json"), JSON.stringify(kept, null, 2));
  console.log(`wrote ${kept.length}`);
}

void main();
