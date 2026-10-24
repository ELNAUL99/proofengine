import type { CompanyCandidate } from "./types";
import { coreName, fetchText } from "./text";

const PRH = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<CompanyCandidate[]>>();
const CACHE_MS = 15 * 60 * 1000;

type PrhName = { name?: string; type?: string | number; endDate?: string };
type PrhDesc = { languageCode?: string; description?: string };
type PrhEntry = { endDate?: string; descriptions?: PrhDesc[] };
type PrhForm = { type?: string; endDate?: string; descriptions?: PrhDesc[] };
type PrhAddress = {
  type?: number;
  street?: string;
  buildingNumber?: string;
  postCode?: string;
  endDate?: string;
  postOffices?: { city?: string; languageCode?: string }[];
};
type PrhCompany = {
  businessId?: { value?: string };
  names?: PrhName[];
  mainBusinessLine?: { type?: string; descriptions?: PrhDesc[] };
  companyForms?: PrhForm[];
  registeredEntries?: PrhEntry[];
  addresses?: PrhAddress[];
  registrationDate?: string;
  endDate?: string;
};

function fi(descriptions?: PrhDesc[]): string {
  return (
    descriptions?.find((item) => item.languageCode === "1")?.description ||
    descriptions?.find((item) => item.languageCode === "3")?.description ||
    ""
  );
}

function open<T extends { endDate?: string }>(items: T[] | undefined): T[] {
  return (items || []).filter((item) => !item.endDate);
}

function isActive(company: PrhCompany): boolean {
  if (company.endDate) return false;
  const entries = open(company.registeredEntries);
  const ceased = entries.some((entry) =>
    (entry.descriptions || []).some((item) => /lakannut|ceased|upphört/i.test(item.description || "")),
  );
  const registered = entries.some((entry) =>
    (entry.descriptions || []).some((item) =>
      /rekisterissä|registered|registrerad/i.test(item.description || ""),
    ),
  );
  if (ceased && !registered) return false;
  return registered || !ceased;
}

function currentNames(company: PrhCompany, type: string): string[] {
  return open(company.names)
    .filter((item) => String(item.type) === type && item.name)
    .map((item) => item.name as string);
}

function addressOf(company: PrhCompany): { city: string; address: string } {
  const address = open(company.addresses).find((item) => item.type === 1) || open(company.addresses)[0];
  if (!address) return { city: "", address: "" };
  const city =
    address.postOffices?.find((item) => item.languageCode === "1")?.city ||
    address.postOffices?.[0]?.city ||
    "";
  const street = [address.street, address.buildingNumber].filter(Boolean).join(" ");
  const line = [street, address.postCode, city].filter(Boolean).join(", ");
  return { city: city ? city.charAt(0) + city.slice(1).toLocaleLowerCase("fi") : "", address: line };
}

function toCandidate(company: PrhCompany, score: number, reason: string): CompanyCandidate | null {
  const businessId = company.businessId?.value || "";
  const primary = currentNames(company, "1")[0] || currentNames(company, "2")[0];
  if (!businessId || !primary) return null;
  const parallel = currentNames(company, "2");
  const where = addressOf(company);
  const form = open(company.companyForms)[0];
  return {
    businessId,
    name: primary,
    matchNames: [primary, ...parallel],
    otherNames: parallel.slice(0, 2),
    industry: fi(company.mainBusinessLine?.descriptions),
    industryCode: company.mainBusinessLine?.type || "",
    form: fi(form?.descriptions),
    city: where.city,
    address: where.address,
    registrationDate: company.registrationDate || "",
    active: isActive(company),
    score,
    reason,
  };
}

function scoreName(query: string, name: string, active: boolean, former: boolean): { score: number; reason: string } {
  const left = coreName(query);
  const right = coreName(name);
  let score = 0;
  let reason = "Partial name";
  if (left && left === right) {
    score = former ? 48 : 100;
    reason = former ? "Matches a former name" : "Exact current name";
  } else if (right.startsWith(`${left} `) && left.length >= 3) {
    score = former ? 30 : 84;
    reason = "Current name starts with the query";
  } else if (left.startsWith(`${right} `) && right.length >= 5) {
    score = 78;
    reason = "Query includes the current name";
  } else if (right.includes(left) && left.length >= 4) {
    score = 36;
    reason = "Name contains the query";
  }
  if (!active) score -= 28;
  return { score, reason };
}

function rank(query: string, company: PrhCompany): CompanyCandidate | null {
  const active = isActive(company);
  const current = [...currentNames(company, "1"), ...currentNames(company, "2")];
  const former = (company.names || [])
    .filter((item) => item.endDate && item.name)
    .map((item) => item.name as string);
  let best = { score: 0, reason: "No name match" };
  for (const name of current) {
    const scored = scoreName(query, name, active, false);
    if (scored.score > best.score) best = scored;
  }
  if (best.score < 70) {
    for (const name of former) {
      const scored = scoreName(query, name, active, true);
      if (scored.score > best.score) best = scored;
    }
  }
  if (best.score < 40) return null;
  return toCandidate(company, best.score, best.reason);
}

async function loadCompanies(url: string): Promise<PrhCompany[]> {
  const response = await fetchText(url, 12000, { headers: { Accept: "application/json" } });
  if (response.status === 429) throw new Error("PRH rate limit. Wait a minute and search again.");
  if (response.status >= 400) throw new Error(`PRH returned ${response.status}.`);
  const payload = JSON.parse(response.text) as { companies?: PrhCompany[]; totalResults?: number };
  return payload.companies || [];
}

function dedupe(candidates: CompanyCandidate[]): CompanyCandidate[] {
  const byId = new Map<string, CompanyCandidate>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.businessId);
    if (!existing || candidate.score > existing.score) byId.set(candidate.businessId, candidate);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fi"));
}

export async function resolveCompany(query: string): Promise<{
  candidates: CompanyCandidate[];
  auto: CompanyCandidate | null;
  fromCache: boolean;
}> {
  const cleaned = query.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) return { candidates: [], auto: null, fromCache: false };

  const businessId = cleaned.match(/^\d{7}-\d$/)
    ? cleaned
    : cleaned.match(/^\d{8}$/)
      ? `${cleaned.slice(0, 7)}-${cleaned.slice(7)}`
      : null;

  const cacheKey = businessId || coreName(cleaned);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { candidates: hit.value, auto: pickAuto(hit.value), fromCache: true };
  }

  let companies: PrhCompany[] = [];
  if (businessId) {
    companies = await loadCompanies(`${PRH}?businessId=${encodeURIComponent(businessId)}`);
    const only = companies[0];
    const candidate = only ? toCandidate(only, 100, "Business ID") : null;
    const candidates = candidate ? [candidate] : [];
    cache.set(cacheKey, { at: Date.now(), value: candidates });
    return { candidates, auto: candidate, fromCache: false };
  }

  const firstUrl = `${PRH}?name=${encodeURIComponent(cleaned)}&page=1`;
  companies = await loadCompanies(firstUrl);
  let ranked = dedupe(companies.map((company) => rank(cleaned, company)).filter((item): item is CompanyCandidate => !!item));
  if ((ranked[0]?.score || 0) < 96) {
    const second = await loadCompanies(`${PRH}?name=${encodeURIComponent(cleaned)}&page=2`);
    ranked = dedupe(
      [...companies, ...second].map((company) => rank(cleaned, company)).filter((item): item is CompanyCandidate => !!item),
    );
  }

  const candidates = ranked.filter((item) => item.score >= 70).slice(0, 6);
  const shown = candidates.length > 0 ? candidates : ranked.slice(0, 3);
  cache.set(cacheKey, { at: Date.now(), value: shown });
  return { candidates: shown, auto: pickAuto(shown), fromCache: false };
}

function pickAuto(candidates: CompanyCandidate[]): CompanyCandidate | null {
  if (candidates.length !== 1) return null;
  return candidates[0].score >= 98 ? candidates[0] : null;
}

export async function getCompany(businessId: string): Promise<CompanyCandidate> {
  const resolved = await resolveCompany(businessId);
  const company = resolved.candidates[0];
  if (!company) throw new Error(`No company found for ${businessId}.`);
  return company;
}
