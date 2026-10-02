import { apiFetch } from "../../../../lib/api";

export async function GET() {
  const apiRes = await apiFetch("/api/workspace/export");
  const body = await apiRes.text();
  return new Response(body, {
    status: apiRes.status,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": apiRes.headers.get("Content-Disposition") ?? "attachment; filename=export.json",
    },
  });
}
