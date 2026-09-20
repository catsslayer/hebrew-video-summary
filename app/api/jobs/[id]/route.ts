import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";

/**
 * מצב עבודה קיימת.
 *
 * עבודה שאינה מוכרת מקבלת 404 עם `reason: "unknown"` — המסך מתרגם את זה
 * להסבר שהעבודה אבדה בהפעלה מחדש של השרת, ולא להודעת שגיאה כללית. המצב יושב
 * בזיכרון התהליך בלבד, ולכן זה תרחיש צפוי ולא תקלה.
 */

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ reason: "unknown" }, { status: 404 });
  }

  // `tempFiles` הם נתיבים פנימיים ואינם נשלחים לדפדפן.
  const { tempFiles: _tempFiles, ...visible } = job;
  return NextResponse.json(visible);
}
