import { NextResponse } from "next/server";
import { resolveCompany } from "@/lib/prh";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim() || "";
    if (query.length < 2) {
      return NextResponse.json({ error: "Enter a company name or a business ID." }, { status: 400 });
    }
    const result = await resolveCompany(query);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
