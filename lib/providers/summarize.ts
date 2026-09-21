import { isMockMode } from "@/lib/config";
import type { Summary } from "@/lib/jobs/store";

/**
 * סיכום — Anthropic.
 *
 * **מסכם תמלול, ולא צופה בסרטון.** לא נשלחת שום תמונה, ולכן הסיכום אינו יכול
 * לדעת מה נראה על המסך — רק מה נאמר. השדה "מה לא ניתן היה לקבוע" קיים בדיוק
 * בשביל זה: כדי שהפער ייאמר במקום להתמלא בניחוש.
 *
 * מחירי התיעוד ל-claude-haiku-4-5: $1 למיליון קלט, $5 למיליון פלט.
 */

export type SummaryResult = {
  summary: Summary;
  mock: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
};

const INSTRUCTIONS = `את מסכמת תמלול של סרטון, בעברית.

חשוב מאוד: קיבלת **תמלול דיבור בלבד**. לא ראית את הסרטון, אין לך גישה
לתמונה, ואינך יודעת מה מוצג על המסך.

החזירי JSON תקין בלבד, בלי טקסט לפניו ואחריו, במבנה:
{
  "topic": "נושא הסרטון במשפט אחד",
  "keyPoints": ["נקודה", "נקודה"],
  "spoken": "תקציר של מה שנאמר, שתיים עד ארבע שורות",
  "notDetermined": ["מה לא ניתן לקבוע מהתמלול בלבד"]
}

כללים:
- בעברית בלבד.
- לא להמציא עובדות, שמות, מספרים או מסקנות שאינם בתמלול.
- notDetermined חייב לכלול לפחות פריט אחד שמבהיר שהניתוח החזותי לא בוצע.`;

const MOCK_SUMMARY: Summary = {
  topic: "[מדומה] הדגמה של העלאת סרטון, חילוץ פס קול וסיכום בעברית",
  keyPoints: [
    "[מדומה] הקובץ נקלט ונבדקו אורכו וסוגו",
    "[מדומה] פס הקול חולץ בנפרד מהווידאו",
    "[מדומה] התמלול סוכם למבנה קבוע",
  ],
  spoken:
    "[תוצאה מדומה — לא בוצעה קריאה ל-Anthropic ולא חויב דבר] הדובר מתאר את שלבי " +
    "המערכת: העלאה, חילוץ אודיו, תמלול וסיכום.",
  notDetermined: [
    "לא בוצע ניתוח חזותי — לא נשלחה אף תמונה לשום מודל, ולכן לא ידוע מה מוצג על המסך",
    "[מדומה] לא ניתן לקבוע זהות דוברים מהתמלול בלבד",
  ],
};

export async function summarize(
  transcript: string,
  signal: AbortSignal
): Promise<SummaryResult> {
  if (isMockMode()) {
    return { summary: MOCK_SUMMARY, mock: true, inputTokens: null, outputTokens: null };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_SUMMARY_MODEL;
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  if (!apiKey || !model) {
    throw new Error("סיכום אינו מוגדר: חסר ANTHROPIC_API_KEY או ANTHROPIC_SUMMARY_MODEL.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // מפתח ברמת הארגון אינו משויך לסביבת עבודה, והספק דורש ממנו לציין
      // באיזו סביבה להשתמש. מפתח שמשויך לסביבה אינו צריך את הכותרת, ולכן היא
      // נשלחת רק כשהוגדרה. מזהה סביבה אינו סוד, אבל הוא מזהה חשבון ולכן הוא
      // נקרא מהסביבה ולא נכתב בקוד.
      ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: `התמלול:\n\n${transcript}` }],
    }),
  });

  if (!response.ok) {
    // גוף השגיאה נשאר ביומן השרת ואינו מוצג: הוא עלול להכיל פרטי חשבון.
    // בלי התיעוד הזה כשל 400 הוא מספר בלבד, ואי אפשר לאבחן אותו בלי לשלם שוב
    // רק כדי לראות מה הספק אמר.
    const detail = await response.text().catch(() => "");
    console.error(`[anthropic] HTTP ${response.status}: ${detail.slice(0, 600)}`);
    throw new Error(`הסיכום נכשל (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("הסיכום לא חזר במבנה הצפוי.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("הסיכום לא היה JSON תקין.");
  }

  const value = parsed as Partial<Summary>;
  const summary: Summary = {
    topic: typeof value.topic === "string" ? value.topic : "",
    keyPoints: Array.isArray(value.keyPoints) ? value.keyPoints.map(String) : [],
    spoken: typeof value.spoken === "string" ? value.spoken : "",
    notDetermined: Array.isArray(value.notDetermined) ? value.notDetermined.map(String) : [],
  };

  // ההבהרה על היעדר הניתוח החזותי נאכפת בקוד ולא נסמכת על המודל.
  const visualNote =
    "לא בוצע ניתוח חזותי — הסיכום מבוסס על פס הקול בלבד, ולא על מה שמוצג על המסך.";
  if (!summary.notDetermined.some((n) => n.includes("ניתוח חזותי"))) {
    summary.notDetermined.unshift(visualNote);
  }

  const inputTokens = Number(data?.usage?.input_tokens);
  const outputTokens = Number(data?.usage?.output_tokens);
  return {
    summary,
    mock: false,
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
  };
}
