/**
 * בדיקה שהמפתחות מוגדרים — **בלי להציג אותם ובלי לקרוא לאף ספק.**
 *
 * הבדיקה קוראת את הקובץ ומדווחת על כל משתנה "מוגדר" או "חסר" בלבד. אין כאן
 * הדפסה של ערך, של קידומת, של סיומת ושל אורך מדויק: כל אחד מהם הוא פירור
 * שמצטרף לפירורים אחרים, ובדיקה אינה סיבה מספקת לפזר אותם.
 *
 * **אין כאן שום קריאת רשת.** מפתח שנראה תקין כאן עדיין אינו מוכיח שהוא עובד —
 * רק קריאה אמיתית תוכיח זאת, והיא בתשלום ואינה מתבצעת כאן.
 *
 *   node tests/env-check.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const FILE = ".env.local";
const REQUIRED = ["GROQ_API_KEY", "ANTHROPIC_API_KEY"];
const EXPECTED = ["GROQ_TRANSCRIBE_MODEL", "ANTHROPIC_SUMMARY_MODEL"];

if (!existsSync(FILE)) {
  console.error(`${FILE} אינו קיים.`);
  process.exit(1);
}

const values = new Map();
for (const line of readFileSync(FILE, "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  if (match) values.set(match[1], match[2].trim().replace(/^["']|["']$/g, ""));
}

let missing = 0;
console.log("מפתחות:");
for (const name of REQUIRED) {
  const filled = Boolean(values.get(name));
  if (!filled) missing++;
  console.log(`  ${filled ? "✓" : "✗"} ${name}: ${filled ? "מוגדר" : "חסר"}`);
}

console.log("מודלים:");
for (const name of EXPECTED) {
  const value = values.get(name);
  // שמות המודלים אינם סוד והם נבדקים לגופם: מזהה שגוי הוא תקלה שמתגלה רק
  // בקריאה בתשלום, וכאן היא מתגלה בחינם.
  console.log(`  ${value ? "✓" : "✗"} ${name}: ${value || "חסר"}`);
  if (!value) missing++;
}

const mock = values.get("MOCK_PROVIDERS") === "true";
console.log(
  mock
    ? "\nמצב מדומה פעיל — לא תתבצע אף קריאה בתשלום."
    : "\n**מצב מדומה כבוי** — הרצה תבצע קריאות בתשלום."
);

console.log(missing === 0
  ? "\nהכול מוגדר. זו בדיקת הגדרה בלבד: לא בוצעה אף קריאה, ולכן תקפות המפתחות לא נבדקה."
  : `\nחסרים ${missing} ערכים.`);
process.exit(missing === 0 ? 0 : 1);
