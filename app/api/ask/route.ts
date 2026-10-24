import { askGrade, evidenceOf } from "@/lib/mistral";
import type { RunResult } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string; mistralKey?: string; result?: RunResult };
  const question = body.question?.trim() || "";
  const apiKey = body.mistralKey?.trim() || process.env.MISTRAL_API_KEY || "";
  if (question.length < 2) {
    return NextResponse.json({ error: "Ask a question about this grade." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Keep the question under 500 characters." }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "No Mistral key. The grade still stands." }, { status: 400 });
  }
  if (!body.result?.company?.businessId) {
    return NextResponse.json({ error: "There is no grade to ask about." }, { status: 400 });
  }
  try {
    const reply = await askGrade(question, evidenceOf(body.result), apiKey);
    return NextResponse.json(reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The follow-up failed. The grade still stands.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
