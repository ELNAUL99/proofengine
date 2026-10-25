import type { RedTeam, RunResult } from "./types";

const MODEL = process.env.MISTRAL_MODEL || "ministral-8b-2512";

export type GradeEvidence = {
  company: string;
  businessId: string;
  city: string;
  industry: string;
  active: boolean;
  sendable: boolean;
  withholdReason: string | null;
  subject: string | null;
  email: string | null;
  quotes: { quote: string; jobTitle: string; posted: string }[];
  fit: {
    seat: string;
    showcaseName: string;
    whyCompany: string;
    whyFit: string;
    need: string;
  } | null;
  refusals: { title: string; overturned: boolean; text: string }[];
};

export function evidenceOf(result: RunResult): GradeEvidence {
  return {
    company: result.company.name,
    businessId: result.company.businessId,
    city: result.company.city,
    industry: result.company.industry,
    active: result.company.active,
    sendable: result.sendable,
    withholdReason: result.withholdReason,
    subject: result.subject,
    email: result.email,
    quotes: result.findings.flatMap((finding) =>
      finding.evidence.map((item) => ({ quote: item.quote, jobTitle: item.jobTitle, posted: item.posted })),
    ),
    fit: result.fit
      ? {
          seat: result.fit.seat,
          showcaseName: result.fit.showcaseName,
          whyCompany: result.fit.whyCompany,
          whyFit: result.fit.whyFit,
          need: result.fit.need,
        }
      : null,
    refusals: (result.refusals || []).map((row) => ({ title: row.title, overturned: row.overturned, text: row.text })),
  };
}

function offGrade(answer: string, evidence: string): string | null {
  if (/€/.test(answer) && !/€/.test(evidence)) return "The answer invented a cost. Discarded. The grade still stands.";
  if (/\b\d{1,2}[.:]\d{2}\b/.test(answer)) return "The answer invented a time. Discarded. The grade still stands.";
  const addresses = answer.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (addresses.some((address) => !evidence.toLowerCase().includes(address.toLowerCase()))) {
    return "The answer invented an email address. Discarded. The grade still stands.";
  }
  return null;
}

export async function redTeam(result: Pick<RunResult, "company" | "email" | "findings">): Promise<RedTeam> {
  const apiKey = process.env.MISTRAL_API_KEY || "";
  if (!apiKey) throw new Error("Red-team is skipped. The draft still stands.");
  if (!result.email) throw new Error("There is no email to pressure-test.");
  const packet = {
    company: result.company.name,
    businessId: result.company.businessId,
    email: result.email,
    quotes: result.findings.flatMap((finding) =>
      finding.evidence.map((item) => ({ quote: item.quote, ad: item.jobTitle, url: item.url })),
    ),
  };
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: `You are red-teaming a sales email before anyone sends it. You are not predicting a reply rate. Do not output a probability, a score, or a percentage.

Facts you may use are only in this JSON. If the email claims something the quotes do not support, that is an objection.

${JSON.stringify(packet)}

Return JSON only:
{"objections":["..."],"killLine":"the single sentence most likely to get the email deleted"}`,
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    message?: string;
    detail?: string;
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  };
  if (!response.ok) {
    throw new Error(payload.message || payload.detail || `Mistral returned ${response.status}. The draft still stands.`);
  }
  const content = payload.choices?.[0]?.message?.content;
  const text = (typeof content === "string" ? content : content?.map((block) => block.text || "").join("\n") || "").trim();
  if (/\d\s?%|reply probability|likelihood/i.test(text)) {
    throw new Error("The red-team answered with a probability. Discarded. The draft still stands.");
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("Red-team did not return JSON. The draft still stands.");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    objections?: unknown;
    killLine?: unknown;
  };
  const objections = Array.isArray(parsed.objections) ? parsed.objections.filter((item) => typeof item === "string") : [];
  const killLine = typeof parsed.killLine === "string" ? parsed.killLine : "";
  if (objections.length === 0 || !killLine) throw new Error("Red-team response was empty. The draft still stands.");
  return { objections: objections.slice(0, 4), killLine, model: MODEL };
}

export async function askGrade(question: string, evidence: GradeEvidence, apiKey: string): Promise<{ answer: string; model: string }> {
  const packet = JSON.stringify(evidence);
  const nextStep = evidence.sendable
    ? "This grade already has a note. The next step is to use that note for the seat named in the grade. Do not say that there is no note."
    : "This grade has no note, because no full sentence in the ads can be sent. The next step is another company whose ad states the work.";
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You answer one follow-up about a finished grade for Velho. You are not grading again.

Use only the JSON. If a fact is not in it, say the grade does not show that.
Do not invent a euro cost, a meeting, a calendar time, a recipient address, or a person's name.
Do not say an email was sent. Do not tell anyone to contact, email, or book the company. The draft is unsent.
Do not mention JSON field names.
${nextStep}
Write plain sentences. No markdown. Answer in the language of the question. Stay under 120 words.

Grade:
${packet}

Question:
${question}`,
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    message?: string;
    detail?: string;
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  };
  if (!response.ok) {
    const detail = payload.message || payload.detail || `Mistral returned ${response.status}.`;
    throw new Error(`${detail} The grade still stands.`);
  }
  const content = payload.choices?.[0]?.message?.content;
  const answer = (typeof content === "string" ? content : content?.map((block) => block.text || "").join("\n") || "").trim();
  if (!answer) throw new Error("Mistral returned an empty answer. The grade still stands.");
  const blocked = offGrade(answer, packet);
  if (blocked) throw new Error(blocked);
  return { answer, model: MODEL };
}
