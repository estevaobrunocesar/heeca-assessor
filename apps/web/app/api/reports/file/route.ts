import { apiFetch } from "../../../../lib/api";

// Streams the generated PDF/Excel from the API to the browser with the
// session's credentials, so the download link in the page can be a plain <a>.
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  const res = await apiFetch(`/api/reports/file${search}`);
  if (!res.ok) return new Response("Não foi possível gerar o relatório.", { status: res.status });

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
    },
  });
}
