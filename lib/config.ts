/**
 * מגבלות ותצורה — במקום אחד.
 *
 * **שלב א׳: תמלול וסיכום בלבד. אין כאן ניתוח חזותי.** לא מחולצים פריימים,
 * לא נשלחת אף תמונה לשום מודל, ושום דבר במערכת אינו "צופה" בסרטון. מה שנותח
 * הוא **פס הקול בלבד** — כלומר מה שנאמר, ולא מה שנראה.
 */

/** 200MB. מעבר לזה ההעלאה עצמה הופכת לבעיה בפני עצמה באבטיפוס מקומי. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * 10 דקות.
 *
 * המגבלה אינה שרירותית: Groq מקבל **25MB** בתוכנית החינמית, והאודיו המחולץ
 * גדל עם האורך. עשר דקות ב-mp3 של 64kbps הן כ-5MB — מרווח בטוח.
 */
export const MAX_DURATION_SECONDS = 10 * 60;

/** האודיו שנשלח לתמלול. mono, 16kHz — מה שמודלי דיבור מצפים לו ממילא. */
export const AUDIO_BITRATE = "64k";
export const AUDIO_SAMPLE_RATE = 16_000;

/** Groq בתוכנית החינמית. נבדק מול האודיו המחולץ לפני השליחה. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
] as const;

/**
 * תקרת זמן לכל שלב בנפרד.
 *
 * תקרה אחת לכל העבודה מסתירה איזה שלב נתקע. כאן כל שלב נעצר בנפרד ומדווח את
 * שמו, כדי שהמסך יגיד **מה** נתקע ולא רק שמשהו נתקע.
 */
export const STEP_TIMEOUT_MS = {
  probe: 30_000,
  extract: 180_000,
  transcribe: 240_000,
  summarize: 120_000,
} as const;

/**
 * **אין ניסיונות חוזרים אוטומטיים.**
 *
 * תמלול וסיכום עולים כסף. ניסיון חוזר אוטומטי מכפיל עלות בלי שאיש ביקש, והוא
 * גם מסתיר תקלה חוזרת במקום להציג אותה. כישלון נעצר ומדווח, וניסיון נוסף
 * נעשה רק בלחיצה מפורשת.
 */
export const AUTOMATIC_RETRIES = 0;

export function isMockMode(): boolean {
  return process.env.MOCK_PROVIDERS === "true";
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
