import { NextRequest, NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

/**
 * DELETE /api/ai/intake/:entity/:id — undo a record saved from the chat.
 *
 * Kept next to the save rather than folded into it because undo is a separate
 * promise: a misheard instruction has to be reversible in one tap, and the
 * backend owns the delete (including the vaccinations that went with the
 * flock), so it has to be the backend that removes it.
 */
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ entity: string; id: string }> }) {
  const { entity, id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const res = await proxyToBackend(`/api/ai/intake/${entity}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return new NextResponse(res.body, { status: res.status });
}