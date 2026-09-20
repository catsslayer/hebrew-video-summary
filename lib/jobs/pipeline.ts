import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Writable } from "node:stream";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MAX_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  STEP_TIMEOUT_MS,
  formatBytes,
  formatDuration,
  isMockMode,
} from "@/lib/config";
import { ToolMissingError, extractAudio, probeDuration, toolsAvailable } from "@/lib/media/ffmpeg";
import { transcribe } from "@/lib/providers/transcribe";
import { summarize } from "@/lib/providers/summarize";
import { addTempFile, failJob, getJob, markStep, patchJob } from "@/lib/jobs/store";

/**
 * הצינור: קליטה → בדיקת אורך → חילוץ אודיו → תמלול → סיכום.
 *
 * **שלב א׳ בלבד — אין ניתוח חזותי.** לא מחולצים פריימים ולא נשלחת שום תמונה.
 *
 * שני כללים מעצבים את הקובץ הזה:
 *
 * 1. **כל שלב מוגבל בזמן בנפרד.** תקרה אחת לכל העבודה מסתירה מי נתקע; כאן
 *    ההודעה אומרת את שם השלב שנעצר.
 * 2. **הקבצים הזמניים מנוקים תמיד** — בהצלחה, בכישלון ובתום זמן כאחד. הניקוי
 *    יושב ב-finally, ולא בסוף המסלול המוצלח.
 */

export function workDirFor(jobId: string): string {
  return join(tmpdir(), "video-insight", jobId);
}

/**
 * כתיבת הקובץ שהועלה לדיסק, **בזרימה**.
 *
 * `await file.arrayBuffer()` היה מחזיק את כל הסרטון בזיכרון התהליך — עד 200MB
 * לקובץ אחד. הזרימה גם מאפשרת לעצור באמצע ברגע שהגודל חורג, במקום לגלות את
 * זה אחרי שהכול כבר נקלט.
 */
export async function receiveUpload(jobId: string, file: File): Promise<string> {
  const dir = workDirFor(jobId);
  await mkdir(dir, { recursive: true });
  addTempFile(jobId, dir);

  markStep(jobId, "upload", "running");

  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-80) || "input";
  const inputPath = join(dir, safeName);

  let written = 0;
  const sink = createWriteStream(inputPath);
  await file.stream().pipeTo(
    Writable.toWeb(sink) as WritableStream<Uint8Array>,
    // כל חריגה עוצרת את הכתיבה מיד; מה שכבר נכתב נמחק בידי הקורא.
  ).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error("כתיבת הקובץ נכשלה.");
  });

  const info = await stat(inputPath);
  written = info.size;
  if (written === 0) {
    throw new Error("הקובץ שהתקבל ריק.");
  }
  if (written > MAX_UPLOAD_BYTES) {
    throw new Error(
      `הקובץ ${formatBytes(written)} חורג מהמגבלה ${formatBytes(MAX_UPLOAD_BYTES)}.`
    );
  }

  patchJob(jobId, { fileBytes: written });
  markStep(jobId, "upload", "done", `${safeName}, ${formatBytes(written)}`);
  return inputPath;
}

function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return work(controller.signal)
    .catch((error: unknown) => {
      if (controller.signal.aborted) {
        throw new Error(`${label} עבר את מגבלת הזמן (${Math.round(ms / 1000)} שניות) ונעצר.`);
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

export async function runPipeline(jobId: string, inputPath: string): Promise<void> {
  const dir = workDirFor(jobId);

  try {
    // ------------------------------------------------- בדיקת אורך ותקינות
    //
    // סוג הקובץ שהדפדפן הצהיר עליו נבדק כבר בשער, אבל הוא הצהרה ולא הוכחה.
    // הבדיקה האמיתית היא כאן: ffprobe קורא את הקובץ בפועל, וקובץ שאינו וידאו
    // ייפול כאן גם אם הוצהר כ-mp4.
    markStep(jobId, "probe", "running");

    if (isMockMode()) {
      // במצב מדומה אין תלות ב-ffmpeg, כדי שאפשר יהיה לבדוק את כל הצינור עוד
      // לפני שהוא מותקן. זה מסומן במפורש ואינו מתחזה לבדיקה אמיתית.
      markStep(jobId, "probe", "done", "מדומה — האורך לא נמדד בפועל");
    } else {
      if (!(await toolsAvailable())) {
        failJob(jobId, "probe", "ffmpeg אינו מותקן. בלעדיו אי אפשר לחלץ את פס הקול.");
        return;
      }
      const duration = await withTimeout(
        () => probeDuration(inputPath, STEP_TIMEOUT_MS.probe),
        STEP_TIMEOUT_MS.probe,
        "בדיקת האורך"
      );
      if (duration > MAX_DURATION_SECONDS) {
        failJob(
          jobId,
          "probe",
          `הסרטון באורך ${formatDuration(duration)} חורג מהמגבלה ` +
            `${formatDuration(MAX_DURATION_SECONDS)}.`
        );
        return;
      }
      patchJob(jobId, { durationSeconds: duration });
      markStep(jobId, "probe", "done", `אורך ${formatDuration(duration)}`);
    }

    // -------------------------------------------------- חילוץ פס הקול
    markStep(jobId, "extract", "running");
    const audioPath = join(dir, "audio.mp3");

    if (isMockMode()) {
      await writeFile(audioPath, Buffer.alloc(0));
      markStep(jobId, "extract", "done", "מדומה — ffmpeg לא הופעל");
    } else {
      await withTimeout(
        () => extractAudio(inputPath, audioPath, STEP_TIMEOUT_MS.extract),
        STEP_TIMEOUT_MS.extract,
        "חילוץ פס הקול"
      );
      const audio = await stat(audioPath);
      markStep(jobId, "extract", "done", `${formatBytes(audio.size)} אודיו`);
    }

    // ------------------------------------------------------------ תמלול
    markStep(jobId, "transcribe", "running");
    const transcription = await withTimeout(
      (signal) => transcribe(audioPath, signal),
      STEP_TIMEOUT_MS.transcribe,
      "התמלול"
    );
    patchJob(jobId, { transcript: transcription.text });
    markStep(
      jobId,
      "transcribe",
      "done",
      transcription.mock ? "תוצאה מדומה, בלי חיוב" : `${transcription.text.length} תווים`
    );

    // ------------------------------------------------------------ סיכום
    //
    // מכאן והלאה כישלון אינו מוחק את התמלול: הוא כבר שמור על העבודה ויוצג
    // במסך גם אם הסיכום ייפול.
    markStep(jobId, "summarize", "running");
    const summarized = await withTimeout(
      (signal) => summarize(transcription.text, signal),
      STEP_TIMEOUT_MS.summarize,
      "הסיכום"
    );
    patchJob(jobId, { summary: summarized.summary });
    markStep(jobId, "summarize", "done", summarized.mock ? "תוצאה מדומה, בלי חיוב" : "הושלם");

    patchJob(jobId, { status: "done" });
  } catch (error) {
    const message =
      error instanceof ToolMissingError || error instanceof Error
        ? error.message
        : "שגיאה לא מזוהה";
    const running = getJob(jobId)?.steps.find((s) => s.state === "running")?.name ?? "probe";
    failJob(jobId, running, message);
  } finally {
    // **ניקוי מובטח.** הסרטון והאודיו אינם נשארים על הדיסק אחרי העיבוד, לא
    // בהצלחה ולא בכישלון.
    await cleanup(jobId);
  }
}

export async function cleanup(jobId: string): Promise<void> {
  await rm(workDirFor(jobId), { recursive: true, force: true }).catch(() => {});
  patchJob(jobId, { tempFiles: [] });
}
