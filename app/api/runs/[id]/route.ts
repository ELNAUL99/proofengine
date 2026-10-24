import { NextResponse } from "next/server";
import { runs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = runs.get(id);
  if (!result) return NextResponse.json({ error: "This brief is no longer in memory." }, { status: 404 });
  return NextResponse.json(result);
}
