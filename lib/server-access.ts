import { createHash, timingSafeEqual } from "node:crypto";

/** Single-owner demo access. Production is closed until a strong password is set. */
export function requireAccess(request: Request): Response | null {
  const password = process.env.APP_PASSWORD;
  if (!password && process.env.NODE_ENV !== "production") return null;
  const headers = { "Cache-Control": "no-store" };
  if (!password || password.length < 20) {
    return new Response("הכניסה למערכת טרם הוגדרה.", { status: 503, headers });
  }
  const expected = "Basic " + Buffer.from(`${process.env.APP_USERNAME || "yasmin"}:${password}`).toString("base64");
  const actual = request.headers.get("authorization") || "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(actual), hash(expected))) {
    return new Response("נדרשת כניסה למערכת.", {
      status: 401,
      headers: { ...headers, "WWW-Authenticate": 'Basic realm="Video Insight", charset="UTF-8"' },
    });
  }
  // Reject cross-site paid actions even when the browser has cached Basic credentials.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    let sameHost = false;
    try { sameHost = !!origin && new URL(origin).host === host; } catch { /* reject */ }
    if (!sameHost || request.headers.get("sec-fetch-site") === "cross-site") {
      return new Response("מקור הבקשה אינו מורשה.", { status: 403, headers });
    }
  }
  return null;
}
