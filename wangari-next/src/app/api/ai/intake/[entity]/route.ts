import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

/**
 * /api/ai/intake/:entity — the guided form, and the save.
 *
 * Proxied to the Express backend rather than handled here, and that is the
 * whole design: the questions, the validation and the writer that saves them
 * all live on the server that owns the database. A second implementation in
 * this app would be a second set of rules, and the day they disagree the
 * assistant collects details the database cannot hold.
 *
 * The token is forwarded because the JWT lives in localStorage — the browser
 * attaches nothing on its own, so without this every save is a 401 and the
 * farmer watches a form that refuses to save.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const res = await proxyToBackend(`/api/ai/intake/${entity}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(res.body, { status: res.status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.text();
  const res = await proxyToBackend(`/api/ai/intake/${entity}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return new NextResponse(res.body, { status: res.status });
}