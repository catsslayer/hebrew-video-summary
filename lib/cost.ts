/**
 * חישוב עלות משימוש בפועל.
 *
 * המחירים נקראו מהמקורות הרשמיים ב-21.9.2026:
 *   Groq  whisper-large-v3-turbo — $0.04 לשעת אודיו, חיוב מינימלי 10 שניות
 *   Anthropic claude-haiku-4-5   — $1 למיליון טוקני קלט, $5 למיליון טוקני פלט
 *
 * **מחירים משתנים.** הם כתובים כאן עם התאריך שבו נבדקו, כדי שמספר ישן לא
 * יתחזה למחיר נוכחי.
 */

export const PRICES_CHECKED_ON = "2026-09-21";
export const GROQ_USD_PER_HOUR = 0.04;
export const GROQ_MIN_BILLED_SECONDS = 10;
export const ANTHROPIC_USD_PER_MTOK_IN = 1;
export const ANTHROPIC_USD_PER_MTOK_OUT = 5;

export type Usage = {
  /** שניות אודיו ששולמו עליהן, לפי מה שהספק דיווח. */
  audioSeconds: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type Cost = {
  transcribeUsd: number | null;
  summarizeUsd: number | null;
  totalUsd: number | null;
  /** true כשחלק מהנתונים חסר, ולכן הסכום אינו מלא. */
  partial: boolean;
};

export function computeCost(usage: Usage): Cost {
  const transcribeUsd =
    usage.audioSeconds === null
      ? null
      : (Math.max(usage.audioSeconds, GROQ_MIN_BILLED_SECONDS) / 3600) * GROQ_USD_PER_HOUR;

  const summarizeUsd =
    usage.inputTokens === null || usage.outputTokens === null
      ? null
      : (usage.inputTokens / 1e6) * ANTHROPIC_USD_PER_MTOK_IN +
        (usage.outputTokens / 1e6) * ANTHROPIC_USD_PER_MTOK_OUT;

  const parts = [transcribeUsd, summarizeUsd];
  const known = parts.filter((p): p is number => p !== null);
  return {
    transcribeUsd,
    summarizeUsd,
    totalUsd: known.length ? known.reduce((a, b) => a + b, 0) : null,
    partial: known.length !== parts.length,
  };
}

export function formatUsd(value: number): string {
  // ארבע ספרות אחרי הנקודה. סכומים כאן קטנים מסנט, ועיגול לשתי ספרות היה
  // הופך כל הרצה ל-"$0.00" ומוחק את ההבדל בין אומדן למדידה.
  return `$${value.toFixed(4)}`;
}
