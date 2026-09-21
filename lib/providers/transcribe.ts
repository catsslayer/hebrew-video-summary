import { readFile } from "node:fs/promises";
import { MAX_AUDIO_BYTES, formatBytes, isMockMode } from "@/lib/config";

/**
 * תמלול — Groq Whisper.
 *
 * **קריאה בתשלום.** מחירי התיעוד: whisper-large-v3-turbo כ-$0.04 לשעה,
 * whisper-large-v3 כ-$0.111 לשעה, מינימום חיוב 10 שניות.
 *
 * **אין ניסיון חוזר אוטומטי.** כישלון חוזר בתשלום הוא בדיוק מה שלא רוצים
 * שיקרה בשקט.
 */

export type TranscribeResult = {
  text: string;
  mock: boolean;
  /** משך האודיו לפי הספק. null כשהוא לא דיווח — לא 0, שמשמעו "לא חויב". */
  seconds: number | null;
};

const MOCK_TRANSCRIPT = `[תוצאה מדומה — לא בוצעה קריאה ל-Groq ולא חויב דבר]

שלום, בסרטון הקצר הזה אני מראה איך מעלים קובץ למערכת, איך מחלצים ממנו את פס
הקול ואיך מקבלים סיכום קצר בעברית. הטקסט הזה נוצר מקומית לצורך בדיקה בלבד,
והוא אינו תמלול של שום סרטון אמיתי.`;

export async function transcribe(
  audioPath: string,
  signal: AbortSignal
): Promise<TranscribeResult> {
  if (isMockMode()) {
    return { text: MOCK_TRANSCRIPT, mock: true, seconds: null };
  }

  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_TRANSCRIBE_MODEL;
  if (!apiKey || !model) {
    throw new Error("תמלול אינו מוגדר: חסר GROQ_API_KEY או GROQ_TRANSCRIBE_MODEL.");
  }

  const audio = await readFile(audioPath);
  // התקרה נבדקת כאן ולא רק בהעלאה: האודיו נוצר אצלנו, וגודלו תלוי באורך.
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(
      `קובץ האודיו ${formatBytes(audio.byteLength)} חורג מהתקרה ${formatBytes(MAX_AUDIO_BYTES)}.`
    );
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", model);
  // עברית נאמרת במפורש. בלי זה המודל מזהה שפה לבד, ולפעמים מתעתק במקום לתמלל.
  form.append("language", "he");
  // verbose_json ולא json: הוא מחזיר גם את משך האודיו, וזה הנתון שממנו
  // מחושבת העלות בפועל. בלעדיו אפשר רק להעריך.
  form.append("response_format", "verbose_json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });

  if (!response.ok) {
    // הטקסט של הספק אינו מוצג למשתמש, אבל כן נרשם ביומן השרת — אחרת אבחון
    // כשל דורש קריאה נוספת בתשלום רק כדי לראות את ההודעה.
    const detail = await response.text().catch(() => "");
    console.error(`[groq] HTTP ${response.status}: ${detail.slice(0, 600)}`);
    throw new Error(`התמלול נכשל (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) throw new Error("התמלול חזר ריק.");
  const reported = Number(data?.duration ?? data?.x_groq?.usage?.total_time);
  return { text, mock: false, seconds: Number.isFinite(reported) ? reported : null };
}
