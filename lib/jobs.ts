import { PROCESS_PATTERNS, STAFFING_AGENCIES, TOOL_PATTERNS } from "./patterns";
import type { CompanyCandidate, JobAd } from "./types";
import { coreName, decodeText, fetchText, fold, formatFiDate, mapPool, sameEmployer } from "./text";

const SEARCH = "https://duunitori.fi/api/v1/jobentries?search=";

type ListJob = {
  heading?: string;
  slug?: string;
  company_name?: string;
  municipality_name?: string;
  date_posted?: string;
  descr?: string;
};

type CacheEntry = { at: number; jobs: JobAd[]; searchedQueries: string[]; adsNamed: number };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 15 * 60 * 1000;

function isAgency(name: string): boolean {
  const folded = fold(name);
  return STAFFING_AGENCIES.some((agency) => folded.includes(fold(agency)));
}

function employerMatch(job: ListJob, company: CompanyCandidate): { via: boolean; advertiser: string | null } | null {
  const published = job.company_name || "";
  const title = job.heading || "";
  const direct = company.matchNames.some((name) => sameEmployer(published, name));
  if (direct) return { via: false, advertiser: null };
  const namedInTitle = company.matchNames.some((name) => sameEmployer(title, name) || titleIncludes(title, name));
  if (namedInTitle && isAgency(published)) return { via: true, advertiser: published };
  return null;
}

function titleIncludes(title: string, officialName: string): boolean {
  const needle = coreName(officialName);
  if (needle.length < 5) return false;
  return fold(title).includes(needle);
}

function priority(job: ListJob): number {
  const text = `${job.heading || ""} ${job.descr || ""}`;
  if (PROCESS_PATTERNS.some((pattern) => pattern.re.test(text))) return 0;
  if (TOOL_PATTERNS.some((pattern) => pattern.re.test(text))) return 1;
  if (/controller|koordinaatt|assistent|talous|palkka|toimisto|raport/i.test(job.heading || "")) return 2;
  return 3;
}

async function search(query: string): Promise<ListJob[]> {
  const response = await fetchText(SEARCH + encodeURIComponent(query), 12000);
  if (response.status === 429) throw new Error("Duunitori rate limit.");
  if (response.status >= 400) throw new Error(`Duunitori search returned ${response.status}.`);
  const payload = JSON.parse(response.text) as { results?: ListJob[] };
  return payload.results || [];
}

function salaryLabel(description: string): string | null {
  const range = description.match(
    /(\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*€\s*\/\s*h\s*[–—-]\s*(\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*€\s*\/\s*h/i,
  );
  if (range) return range[0].replace(/\s+/g, " ");
  const monthly = description.match(
    /(\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*€\s*\/\s*(?:kk|kuukausi)\s*[–—-]\s*(\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?)\s*€\s*\/\s*(?:kk|kuukausi)/i,
  );
  if (monthly) return monthly[0].replace(/\s+/g, " ");
  const labelled = description.match(/palkkahaarukka:\s*([^.\n]+)/i);
  return labelled ? labelled[1].trim() : null;
}

async function readJob(job: ListJob, match: { via: boolean; advertiser: string | null }): Promise<JobAd | null> {
  const slug = job.slug;
  if (!slug) return null;
  const url = `https://duunitori.fi/tyopaikat/tyo/${slug}`;
  let description = decodeText(job.descr || "");
  let complete = false;
  try {
    const page = await fetchText(url, 8000, { headers: { Accept: "text/html" } });
    if (page.status < 400) {
      const block = page.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (block) {
        const data = JSON.parse(block[1]) as { description?: string };
        if (data.description) {
          description = decodeText(data.description);
          complete = true;
        }
      }
    }
  } catch {
    complete = false;
  }
  return {
    id: slug,
    title: job.heading || "Untitled ad",
    companyName: job.company_name || "",
    municipality: job.municipality_name || "",
    posted: job.date_posted ? formatFiDate(job.date_posted) : "",
    url,
    description,
    descriptionComplete: complete,
    salaryLabel: salaryLabel(description),
    viaStaffingAgency: match.via,
    advertiser: match.advertiser,
  };
}

export async function collectJobs(company: CompanyCandidate): Promise<{
  jobs: JobAd[];
  searchedQueries: string[];
  adsNamed: number;
  fromCache: boolean;
  error?: string;
}> {
  const cacheKey = company.businessId;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return {
      jobs: hit.jobs,
      searchedQueries: hit.searchedQueries,
      adsNamed: hit.adsNamed,
      fromCache: true,
    };
  }

  const stripped = coreName(company.name);
  const queries = [company.name];
  if (stripped.length >= 4 && stripped !== fold(company.name)) queries.push(stripped);
  const uniqueQueries = [...new Set(queries)];

  try {
    const lists = await mapPool(uniqueQueries, 2, (query) => search(query));
    const seen = new Set<string>();
    const matched: { job: ListJob; match: { via: boolean; advertiser: string | null } }[] = [];
    for (const list of lists) {
      for (const job of list) {
        if (!job.slug || seen.has(job.slug)) continue;
        const match = employerMatch(job, company);
        if (!match) continue;
        seen.add(job.slug);
        matched.push({ job, match });
      }
    }
    matched.sort((a, b) => priority(a.job) - priority(b.job) || String(b.job.date_posted).localeCompare(String(a.job.date_posted)));
    const chosen = matched.slice(0, 8);
    const jobs = (await mapPool(chosen, 4, (item) => readJob(item.job, item.match))).filter(
      (job): job is JobAd => !!job,
    );
    cache.set(cacheKey, {
      at: Date.now(),
      jobs,
      searchedQueries: uniqueQueries,
      adsNamed: matched.length,
    });
    return { jobs, searchedQueries: uniqueQueries, adsNamed: matched.length, fromCache: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job search failed.";
    return { jobs: [], searchedQueries: uniqueQueries, adsNamed: 0, fromCache: false, error: message };
  }
}
