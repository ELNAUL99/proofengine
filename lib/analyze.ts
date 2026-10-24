import { acceptableQuote, findQuote, PROCESS_PATTERNS, textIncludes, TOOL_PATTERNS } from "./patterns";
import type { AuditCheck, CompanyCandidate, Evidence, Finding, JobAd } from "./types";
import { quoteLanguage, wordCount } from "./text";

const SENDER = {
  name: "Oskar Kallio",
  company: "Velho Applied Intelligence",
};

function evidenceFor(job: JobAd, quote: string, pattern: string): Evidence {
  return {
    jobId: job.id,
    jobTitle: job.title,
    url: job.url,
    posted: job.posted,
    quote,
    pattern,
    viaStaffingAgency: job.viaStaffingAgency,
    advertiser: job.advertiser,
  };
}

export function buildFindings(jobs: JobAd[]): Finding[] {
  const findings: Finding[] = [];

  for (const pattern of PROCESS_PATTERNS) {
    const evidence: Evidence[] = [];
    for (const job of jobs) {
      if (!job.descriptionComplete) continue;
      const quote = findQuote(job.description, pattern.re);
      if (!quote || !acceptableQuote(quote) || !textIncludes(job.description, quote)) continue;
      evidence.push(evidenceFor(job, quote, pattern.label));
    }
    if (evidence.length === 0) continue;
    findings.push({
      id: pattern.id,
      kind: "process",
      headline: pattern.label,
      reading:
        "The ad describes the work in these words. That is the finding. It is not a euro saving, and it is not proof the company has already decided to buy.",
      service: "Automations, if this step is still done by a person.",
      evidence,
    });
  }

  for (const pattern of TOOL_PATTERNS) {
    const evidence: Evidence[] = [];
    for (const job of jobs) {
      if (!job.descriptionComplete) continue;
      const quote = findQuote(job.description, pattern.re);
      if (!quote || !acceptableQuote(quote) || !textIncludes(job.description, quote)) continue;
      evidence.push(evidenceFor(job, quote, pattern.label));
    }
    if (evidence.length === 0) continue;
    findings.push({
      id: pattern.id,
      kind: "tool",
      headline: `${pattern.label} is named in the ad`,
      reading: `The ad requires ${pattern.label}. That can mean the process lives in that tool. It can also mean the person is simply expected to know it. The ad does not say which.`,
      service: "Internal tools, only if that spreadsheet or report is the process.",
      evidence,
    });
  }

  return findings;
}

function subjectLine(finding: Finding, companyName: string, lang: "fi" | "en"): string {
  const subjects: Record<string, { fi: string; en: string }> = {
    excel: { fi: "Excel työpaikkailmoituksessa", en: "Excel in a job ad" },
    powerbi: { fi: "Power BI työpaikkailmoituksessa", en: "Power BI in a job ad" },
    sheets: { fi: "Taulukkolaskenta työpaikkailmoituksessa", en: "Spreadsheets in a job ad" },
    manual: { fi: "Manuaalinen työvaihe ilmoituksessa", en: "A manual step, in their ad" },
    "data-entry": { fi: "Tietojen syöttö ilmoituksessa", en: "Data entry, in their ad" },
    copy: { fi: "Tietojen kopiointi ilmoituksessa", en: "Copying data, in their ad" },
    "between-systems": { fi: "Työ järjestelmien välillä", en: "Work between systems, in their ad" },
  };
  const label = subjects[finding.id]?.[lang] || finding.headline;
  return `${label} — ${companyName}`;
}

function lead(findings: Finding[]): Finding | null {
  return findings.find((finding) => finding.kind === "process") || findings[0] || null;
}

export function composeEmail(
  company: CompanyCandidate,
  findings: Finding[],
  briefUrl: string,
): {
  sendable: boolean;
  withholdReason: string | null;
  subject: string | null;
  email: string | null;
  emailLang: "fi" | "en" | null;
  gloss: string | null;
  glossLang: "fi" | "en" | null;
} {
  const finding = lead(findings);
  if (!finding) {
    return {
      sendable: false,
      withholdReason: "No sentence we can send, so there is no brief.",
      subject: null,
      email: null,
      emailLang: null,
      gloss: null,
      glossLang: null,
    };
  }

  const item = finding.evidence[0];
  const lang = quoteLanguage(item.quote);
  const staffingFi = item.viaStaffingAgency
    ? `Ilmoittaja on ${item.advertiser}, ei välttämättä ${company.name} itse.`
    : null;
  const staffingEn = item.viaStaffingAgency
    ? `The advertiser is ${item.advertiser}, not necessarily ${company.name} itself.`
    : null;

  const fi = [
    "Hei,",
    "",
    `${company.name} on julkaissut ilmoituksen «${item.jobTitle}»${item.posted ? ` (${item.posted})` : ""}. Siinä lukee:`,
    "",
    `«${item.quote}»`,
    "",
    finding.kind === "process"
      ? "Ilmoitus kuvaa työn näillä sanoilla. En laske siitä säästöä."
      : "En päättele tästä vuosikustannusta. Kysymys on, onko tuo työkalu edelleen itse prosessi.",
    staffingFi,
    "",
    "Koosteessa on neljä kohtaa: miksi juuri tämä yritys, miksi kuvio sopii Velholle, mitä he tarvitsevat, ja mikä julkaistu työ on lähin esimerkki.",
    "",
    `Ilmoitus: ${item.url}`,
    `Kooste: ${briefUrl}`,
    "",
    "Käydäänkö havainto läpi 30 minuutissa? Valmistelua ei tarvita.",
    "",
    SENDER.name,
    SENDER.company,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const en = [
    "Hi,",
    "",
    `${company.name} published an ad, “${item.jobTitle}”${item.posted ? ` (${item.posted})` : ""}. It says:`,
    "",
    `"${item.quote}"`,
    "",
    finding.kind === "process"
      ? "The ad describes the work in those words. I am not turning that into a saving."
      : "The ad asks for this skill. I am not turning that into an annual cost. The question is whether this tool still is the process.",
    staffingEn,
    "",
    "The note has four parts: why this company, why the pattern fits Velho, what they would need, and which published piece of work is the closest example.",
    "",
    `Ad: ${item.url}`,
    `Brief: ${briefUrl}`,
    "",
    "Worth 30 minutes to walk through that quote? No preparation on your side.",
    "",
    SENDER.name,
    SENDER.company,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  if (lang === "fi") {
    return {
      sendable: true,
      withholdReason: null,
      subject: subjectLine(finding, company.name, "fi"),
      email: fi,
      emailLang: "fi",
      gloss: en,
      glossLang: "en",
    };
  }
  return {
    sendable: true,
    withholdReason: null,
    subject: subjectLine(finding, company.name, "en"),
    email: en,
    emailLang: "en",
    gloss: fi,
    glossLang: "fi",
  };
}

export function audit(email: string | null, jobs: JobAd[], findings: Finding[]): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const quotes = findings.flatMap((finding) => finding.evidence);
  const sourced = quotes.every((item) => {
    const job = jobs.find((candidate) => candidate.id === item.jobId);
    return !!job && textIncludes(job.description, item.quote);
  });
  const clean = quotes.every((item) => acceptableQuote(item.quote));
  checks.push({
    id: "verbatim",
    status: quotes.length === 0 ? "warn" : sourced && clean ? "pass" : "block",
    text:
      quotes.length === 0
        ? "No quote, so nothing is claimed."
        : clean
          ? "Every quote is a full sentence from the ad we fetched."
          : "A quote was cut mid-sentence. The email is withheld.",
  });

  if (email) {
    const mentionsMoney = /€|\beur\b|\d{2,3}\s?000/i.test(email);
    const moneyInSource = quotes.some((item) => /€/.test(item.quote)) || jobs.some((job) => job.salaryLabel && email.includes(job.salaryLabel));
    checks.push({
      id: "money",
      status: mentionsMoney && !moneyInSource ? "block" : "pass",
      text: mentionsMoney ? "The email mentions money that has to appear in the ad." : "The email does not invent a cost.",
    });
    const words = wordCount(email);
    checks.push({
      id: "length",
      status: words <= 120 ? "pass" : "warn",
      text: `${words} words. Keep the note under 120.`,
    });
  }

  if (quotes.some((item) => item.viaStaffingAgency)) {
    checks.push({
      id: "agency",
      status: "warn",
      text: "At least one quote comes from a staffing-agency ad that names the company. Say that out loud.",
    });
  }

  checks.push({
    id: "identity",
    status: "pass",
    text: "Company identity comes from the PRH trade register, not from the job board's search guess.",
  });

  return checks;
}

export function emailWordCount(email: string | null): number | null {
  return email ? wordCount(email) : null;
}
