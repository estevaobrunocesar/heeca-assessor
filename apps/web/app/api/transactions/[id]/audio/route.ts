import { apiFetch } from "../../../../../lib/api";

// Plays the original voice message of an entry, fetched with the session's credentials.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiFetch(`/api/transactions/${encodeURIComponent(id)}/audio`);
  if (!res.ok) return new Response("Áudio não encontrado.", { status: res.status });
  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": res.headers.get("content-type") ?? "audio/ogg", "Cache-Control": "private, no-store" },
  });
}
