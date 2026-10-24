import type { RedTeam, RunResult } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export async function redTeam(result: Pick<RunResult, "company" | "email" | "findings">, apiKey: string): Promise<RedTeam> {
  if (!result.email) throw new Error("There is no email to pressure-test.");
  const packet = {
    company: result.company.name,
    businessId: result.company.businessId,
    email: result.email,
    quotes: result.findings.flatMap((finding) =>
      finding.evidence.map((item) => ({ quote: item.quote, ad: item.jobTitle, url: item.url })),
    ),
  };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
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
    error?: { message?: string };
    content?: { type: string; text?: string }[];
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Claude returned ${response.status}.`);
  }
  const text = payload.content?.find((block) => block.type === "text")?.text || "";
  if (/\d\s?%|reply probability|likelihood/i.test(text)) {
    throw new Error("The red-team answered with a probability. Discarded.");
  }
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error("Red-team did not return JSON.");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    objections?: unknown;
    killLine?: unknown;
  };
  const objections = Array.isArray(parsed.objections) ? parsed.objections.filter((item) => typeof item === "string") : [];
  const killLine = typeof parsed.killLine === "string" ? parsed.killLine : "";
  if (objections.length === 0 || !killLine) throw new Error("Red-team response was empty.");
  return { objections: objections.slice(0, 4), killLine, model: MODEL };
}
