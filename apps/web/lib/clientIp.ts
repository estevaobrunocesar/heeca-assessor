/**
 * Headers that tell the API who is really calling. The web app talks to the API from its own container, so
 * without this every visitor would share one address (and one rate limit). The proxy in front of the web app
 * has already put the real client address in X-Forwarded-For; it is passed on untouched.
 */
export function forwardedFor(req: Request): Record<string, string> {
  const chain = req.headers.get("x-forwarded-for");
  return chain ? { "X-Forwarded-For": chain } : {};
}
