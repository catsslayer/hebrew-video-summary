import { requireAccess } from "@/lib/server-access";
import { NextResponse } from "next/server";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, formatBytes, isMockMode } from "@/lib/config";
import { createJob } from "@/lib/jobs/store";
import { cleanup, receiveUpload, runPipeline } from "@/lib/jobs/pipeline";

/**
 * יצירת עבודת ניתוח חדשה.
 *
 * מחזיר מיד את מזהה העבודה, והצינור ממשיך ברקע. המסך מוסיף את המזהה לכתובת,
 * וכך **רענון הדף אינו מתחיל ניתוח נוסף** — הוא חוזר לאותה עבודה.
 *
 * מגבלת הגודל נבדקת פעמיים: על ההצהרה של הדפדפן, כדי לדחות מוקדם ובלי לכתוב
 * לדיסק, ועל מה שנכתב בפועל, כי ההצהרה אינה הוכחה.
 */

export const runtime = "nodejs";
// עיבוד סרטון אורך זמן; הערך תואם את סכום תקרות הזמן של השלבים בתוספת מרווח.
export const maxDuration = 600;

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  // הבדיקה המוקדמת ביותר האפשרית. `request.formData()` מפענח את כל הגוף לפני
  // שהקוד שלנו רואה אותו, ולכן בלי השורות האלה קובץ ענק היה נקלט במלואו רק כדי
  // להידחות אחר כך.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error:
          `הבקשה ${formatBytes(declaredLength)} חורגת מהמגבלה ` +
          `${formatBytes(MAX_UPLOAD_BYTES)}.`,
      },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "לא התקבל קובץ תקין." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "לא נבחר קובץ." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error:
          `הקובץ ${formatBytes(file.size)} חורג מהמגבלה ` +
          `${formatBytes(MAX_UPLOAD_BYTES)}.`,
      },
      { status: 413 }
    );
  }

  // סוג הקובץ שהדפדפן מצהיר עליו הוא סינון מוקדם בלבד. הבדיקה שקובעת היא
  // ffprobe בשלב הבא, שקורא את הקובץ עצמו.
  if (file.type && !ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { error: `סוג הקובץ ${file.type} אינו נתמך. נתמכים: MP4, MOV, WebM, MKV.` },
      { status: 415 }
    );
  }

  const job = createJob({ fileName: file.name, fileBytes: file.size, mock: isMockMode() });

  let inputPath: string;
  try {
    inputPath = await receiveUpload(job.id, file);
  } catch (error) {
    await cleanup(job.id);
    const message = error instanceof Error ? error.message : "קליטת הקובץ נכשלה.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // הצינור רץ ברקע. השגיאות שלו נשמרות על העבודה ונקראות דרך GET, ולכן אין
  // צורך להמתין לו כאן — והמסך מקבל מזהה לפני שהעיבוד התחיל.
  void runPipeline(job.id, inputPath);

  return NextResponse.json({ jobId: job.id, mock: job.mock }, { status: 202 });
}
