import { apiFetch } from "../../../../lib/api";

// Streams the filtered CSV from the API with the session's credentials.
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  const res = await apiFetch(`/api/transactions/export.csv${search}`);
  if (!res.ok) return new Response("Não foi possível exportar.", { status: res.status });
  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="lancamentos.csv"',
    },
  });
}
