import { audit, buildFindings, composeEmail, emailWordCount } from "@/lib/analyze";
import { buildFit } from "@/lib/fit";
import { buildRefusals, normalizeGuess } from "@/lib/refusals";
import { redTeam } from "@/lib/mistral";
import { collectJobs } from "@/lib/jobs";
import { getCompany } from "@/lib/prh";
import { saveRun } from "@/lib/store";
import type { RunResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    businessId?: string;
    guess?: { seat?: string; showcase?: string };
  };
  const businessId = body.businessId?.trim() || "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        if (!/^\d{7}-\d$/.test(businessId)) {
          send("error", { message: "Pick a company from the register before running." });
          return;
        }
        send("stage", { id: "registry" });
        const company = await getCompany(businessId);
        send("company", company);

        send("stage", { id: "jobs" });
        const collected = await collectJobs(company);
        send("stage", { id: "read", adsNamed: collected.adsNamed, adsRead: collected.jobs.length });

        const id = crypto.randomUUID();
        const briefUrl = `${new URL(request.url).origin}/brief/${id}`;
        const findings = buildFindings(collected.jobs);
        const drafted = composeEmail(company, findings, briefUrl);
        const checks = audit(drafted.email, collected.jobs, findings);
        const blocked = checks.find((check) => check.status === "block");
        const sendable = drafted.sendable && !blocked;
        const result: RunResult = {
          id,
          createdAt: new Date().toISOString(),
          company,
          sources: {
            jobs: collected.error ? "failed" : collected.jobs.length > 0 ? "ok" : "empty",
            jobsError: collected.error,
            searchedQueries: collected.searchedQueries,
            adsNamed: collected.adsNamed,
            adsRead: collected.jobs.length,
            fromCache: collected.fromCache,
          },
          jobs: collected.jobs,
          findings,
          sendable,
          withholdReason: sendable ? null : blocked?.text || drafted.withholdReason,
          subject: sendable ? drafted.subject : null,
          email: sendable ? drafted.email : null,
          emailLang: sendable ? drafted.emailLang : null,
          gloss: sendable ? drafted.gloss : null,
          glossLang: sendable ? drafted.glossLang : null,
          emailWords: sendable ? emailWordCount(drafted.email) : null,
          checks,
          fit: null,
          guess: null,
          refusals: null,
          redteam: null,
          redteamError: null,
        };

        result.fit = sendable ? buildFit(company, findings) : null;
        if (result.fit) {
          result.guess = normalizeGuess(body.guess);
          result.refusals = buildRefusals(result.fit, result.guess);
        }

        if (!sendable) {
          result.jobs = [];
          result.findings = [];
          result.checks = [];
          send("done", result);
          return;
        }

        if (process.env.MISTRAL_API_KEY && result.email) {
          send("stage", { id: "redteam" });
          try {
            result.redteam = await redTeam(result);
          } catch (error) {
            result.redteamError = error instanceof Error ? error.message : "Red-team failed. The draft still stands.";
          }
        }

        saveRun(result);
        send("done", result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The run failed.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
