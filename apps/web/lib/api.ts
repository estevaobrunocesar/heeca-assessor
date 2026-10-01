import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "session";

export async function getSessionToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export { SESSION_COOKIE, API_URL };

export async function apiFetch(path: string, init?: RequestInit) {
  const token = await getSessionToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}
