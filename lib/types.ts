export type CompanyCandidate = {
  businessId: string;
  name: string;
  matchNames: string[];
  otherNames: string[];
  industry: string;
  industryCode: string;
  form: string;
  city: string;
  address: string;
  registrationDate: string;
  active: boolean;
  score: number;
  reason: string;
};

export type JobAd = {
  id: string;
  title: string;
  companyName: string;
  municipality: string;
  posted: string;
  url: string;
  description: string;
  descriptionComplete: boolean;
  salaryLabel: string | null;
  viaStaffingAgency: boolean;
  advertiser: string | null;
};

export type FindingKind = "process" | "tool";

export type Evidence = {
  jobId: string;
  jobTitle: string;
  url: string;
  posted: string;
  quote: string;
  pattern: string;
  viaStaffingAgency: boolean;
  advertiser: string | null;
};

export type Finding = {
  id: string;
  kind: FindingKind;
  headline: string;
  reading: string;
  service: string;
  evidence: Evidence[];
};

export type AuditCheck = {
  id: string;
  status: "pass" | "warn" | "block";
  text: string;
};

export type Guess = {
  seat: string;
  showcase: string;
};

export type Refusal = {
  id: "seat" | "showcase" | "cost";
  overturned: boolean;
  title: string;
  text: string;
  textFi: string;
};

export type Fit = {
  seat: string;
  seatFi: string;
  whyCompany: string;
  whyCompanyFi: string;
  whyFit: string;
  whyFitFi: string;
  need: string;
  needFi: string;
  showcaseName: string;
  showcaseUrl: string;
  showcaseKind: string;
  showcaseWhy: string;
  showcaseWhyFi: string;
};

export type RedTeam = {
  objections: string[];
  killLine: string;
  model: string;
};

export type RunResult = {
  id: string;
  createdAt: string;
  company: CompanyCandidate;
  sources: {
    jobs: "ok" | "empty" | "failed";
    jobsError?: string;
    searchedQueries: string[];
    adsNamed: number;
    adsRead: number;
    fromCache: boolean;
  };
  jobs: JobAd[];
  findings: Finding[];
  sendable: boolean;
  withholdReason: string | null;
  subject: string | null;
  email: string | null;
  emailLang: "fi" | "en" | null;
  gloss: string | null;
  glossLang: "fi" | "en" | null;
  emailWords: number | null;
  checks: AuditCheck[];
  fit: Fit | null;
  guess: Guess | null;
  refusals: Refusal[] | null;
  redteam: RedTeam | null;
  redteamError: string | null;
};
