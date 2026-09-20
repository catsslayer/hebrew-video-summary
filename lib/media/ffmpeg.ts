import { spawn } from "node:child_process";
import { AUDIO_BITRATE, AUDIO_SAMPLE_RATE } from "@/lib/config";

/**
 * עטיפה ל-ffmpeg ול-ffprobe.
 *
 * **כל הרצה מוגבלת בזמן.** תהליך חיצוני שנתקע הוא בדיוק המקרה שמשאיר מסך
 * תקוע ב"מעבד…", ולכן התהליך נהרג בתום הזמן והשגיאה אומרת מה נתקע.
 *
 * אין כאן שום נגיעה בתמונה: היחיד שמחולץ הוא פס הקול.
 */

export class ToolMissingError extends Error {
  constructor(tool: string) {
    super(`${tool} אינו מותקן. בלעדיו אי אפשר לחלץ את פס הקול.`);
    this.name = "ToolMissingError";
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
      // שורת השגיאה האחרונה של ffmpeg היא בדרך כלל הסיבה האמיתית.
      else reject(new Error(stderr.trim().split("\n").pop() || `${tool} נכשל (קוד ${code})`));
    });
  });
}

/** אורך הסרטון בשניות. נקרא לפני כל עיבוד, כדי לאכוף את מגבלת האורך מוקדם. */
export async function probeDuration(filePath: string, timeoutMs: number): Promise<number> {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath],
    timeoutMs
  );
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("לא ניתן לקרוא את אורך הסרטון. ייתכן שהקובץ פגום או שאינו וידאו.");
  }
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
  await run(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
     "-vn", "-ac", "1", "-ar", String(AUDIO_SAMPLE_RATE), "-b:a", AUDIO_BITRATE, outputPath],
    timeoutMs
  );
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
