import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/lib/server-access";

export function proxy(request: NextRequest) {
  const denied = requireAccess(request);
  if (denied?.status === 401) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return denied || NextResponse.next();
}

// API handlers check access themselves, before reading upload bodies.
export const config = { matcher: ["/"] };
