import { spawn } from "node:child_process";
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from "@/lib/config";

/**
 * עטיפה ל-ffmpeg ול-ffprobe.
 *
 * **כל הרצה מוגבלת בזמן.** תהליך חיצוני שנתקע הוא בדיוק המקרה שמשאיר מסך תקוע
 * ב"מעבד…", ולכן התהליך נהרג בתום הזמן והשגיאה אומרת מה נתקע.
 *
 * **פלט השגיאה הגולמי של הכלי אינו יוצא מכאן.** הוא מכיל את הנתיב המלא של
 * הקובץ הזמני על הדיסק, והוא כתוב בשפת ffmpeg ולא בשפה של מי שמעלה סרטון. הוא
 * נרשם ליומן השרת, והקורא מקבל הודעה שלנו.
 *
 * אין כאן שום נגיעה בתמונה: היחיד שמחולץ הוא פס הקול.
 */

export class ToolMissingError extends Error {
  constructor(tool: string) {
    super(`${tool} אינו מותקן. בלעדיו אי אפשר לחלץ את פס הקול.`);
    this.name = "ToolMissingError";
  }
}

/** כישלון של הכלי עצמו. `detail` נשאר בשרת ואינו מוצג. */
class ToolFailedError extends Error {
  readonly detail: string;
  constructor(tool: string, detail: string) {
    super(`${tool} נכשל`);
    this.name = "ToolFailedError";
    this.detail = detail;
  }
}

function run(
  tool: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(tool, args);
    } catch {
      reject(new ToolMissingError(tool));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${tool} עבר את מגבלת הזמן ונעצר`));
    }, timeoutMs);

    child.stdout?.on("data", (c) => { stdout += String(c); });
    child.stderr?.on("data", (c) => { stderr += String(c); });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new ToolMissingError(tool) : err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new ToolFailedError(tool, stderr.trim() || `קוד יציאה ${code}`));
    });
  });
}

/** תרגום כישלון של הכלי להודעה שלנו, עם רישום הסיבה האמיתית ליומן השרת. */
function translate(error: unknown, message: string): Error {
  if (error instanceof ToolMissingError) return error;
  if (error instanceof ToolFailedError) {
    console.error(`[ffmpeg] ${error.message}: ${error.detail}`);
    return new Error(message);
  }
  return error instanceof Error ? error : new Error(message);
}

/** אורך הסרטון בשניות. נקרא לפני כל עיבוד, כדי לאכוף את מגבלת האורך מוקדם. */
export async function probeDuration(filePath: string, timeoutMs: number): Promise<number> {
  const unreadable = "לא ניתן לקרוא את אורך הסרטון. ייתכן שהקובץ פגום או שאינו וידאו.";

  let stdout: string;
  try {
    ({ stdout } = await run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath],
      timeoutMs
    ));
  } catch (error) {
    throw translate(error, unreadable);
  }

  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(unreadable);
  return seconds;
}

/**
 * חילוץ פס הקול ל-mp3 קטן.
 *
 * `-vn` מוודא שהווידאו אינו נכנס כלל. mono ו-16kHz הם מה שמודלי דיבור מצפים
 * לו, והם גם מה שמחזיק את הקובץ הרחק מתקרת 25MB.
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  timeoutMs: number
): Promise<void> {
  try {
    await run(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
       "-vn", "-ac", "1", "-ar", String(AUDIO_SAMPLE_RATE), "-b:a", AUDIO_BITRATE, outputPath],
      timeoutMs
    );
  } catch (error) {
    // סרטון בלי מסלול קול הוא המקרה השכיח, והוא ראוי להודעה משלו: אין כאן
    // תקלה לתקן, פשוט אין מה לתמלל.
    const detail = error instanceof ToolFailedError ? error.detail : "";
    if (/does not contain any stream|Output file is empty/i.test(detail)) {
      console.error(`[ffmpeg] ${detail}`);
      throw new Error("בסרטון אין מסלול קול, ולכן אין מה לתמלל.");
    }
    throw translate(error, "חילוץ פס הקול נכשל. ייתכן שהקובץ פגום.");
  }
}

/** בדיקה מוקדמת, כדי שהמסך יגיד "ffmpeg חסר" ולא ייפול באמצע העיבוד. */
export async function toolsAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"], 5_000);
    await run("ffprobe", ["-version"], 5_000);
    return true;
  } catch {
    return false;
  }
}
