import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import { runSummaryOnly } from "@/lib/jobs/pipeline";

/**
 * ניסיון נוסף לשלב הסיכום בלבד.
 *
 * **נקרא רק בלחיצה מפורשת.** אין כאן חזרה אוטומטית: קריאה בתשלום שחוזרת על
 * עצמה בשקט מכפילה עלות ומסתירה תקלה חוזרת.
 *
 * הבקשה נדחית כשאין תמלול שמור, וכשכבר יש סיכום — כדי ששליחה כפולה או רענון
 * לא ישלמו פעמיים על אותו דבר.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/summarize">) {
  const { id } = await ctx.params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ reason: "unknown" }, { status: 404 });
  }
  if (!job.transcript) {
    return NextResponse.json(
      { error: "אין תמלול שמור, ולכן אין ממה לסכם." },
      { status: 409 }
    );
  }
  if (job.summary) {
    return NextResponse.json({ error: "כבר קיים סיכום לעבודה הזו." }, { status: 409 });
  }
  if (job.status === "running") {
    return NextResponse.json({ error: "העבודה כבר בעיבוד." }, { status: 409 });
  }

  void runSummaryOnly(id);
  return NextResponse.json({ ok: true }, { status: 202 });
}
