import { NextResponse } from "next/server";
import { createSession, safeEqual, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/server-access";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password || password.length < 20) return new Response("הכניסה טרם הוגדרה", { status: 503 });
  const origin = request.headers.get("origin");
  let allowed = false;
  try { allowed = !!origin && new URL(origin).host === request.headers.get("host"); } catch { /* reject */ }
  if (!allowed || request.headers.get("sec-fetch-site") === "cross-site") return new Response("מקור לא מורשה", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return new Response("בקשה גדולה מדי", { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return new Response("בקשה לא תקינה", { status: 400 }); }
  const username = form.get("username"); const submitted = form.get("password");
  const valid = typeof username === "string" && typeof submitted === "string" &&
    safeEqual(username, process.env.APP_USERNAME || "yasmin") && safeEqual(submitted, password);
  const response = new NextResponse(null, { status: 303, headers: { Location: valid ? "/" : "/login?error=1", "Cache-Control": "no-store" } });
  if (valid) response.cookies.set(SESSION_COOKIE, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
