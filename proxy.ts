import { NextResponse, type NextRequest } from "next/server";
import { requireAccess } from "@/lib/server-access";

export function proxy(request: NextRequest) {
  return requireAccess(request) || NextResponse.next();
}

// API handlers check access themselves, before reading upload bodies.
export const config = { matcher: ["/"] };
