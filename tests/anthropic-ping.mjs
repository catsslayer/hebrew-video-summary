/**
 * בדיקת מפתח מינימלית מול Anthropic.
 *
 * **קריאה בתשלום, אך זניחה:** max_tokens=1 ובקשה של כמה מילים — כשני מאיות
 * של סנט. היא קיימת כדי שכשל הגדרה יתגלה **לפני** שמשלמים על תמלול שייזרק.
 *
 * היא אינה מדפיסה את המפתח, ומדפיסה את הודעת השגיאה של הספק במלואה — כי כשל
 * הגדרה הוא בדיוק המקרה שבו ההודעה הזו היא כל העניין.
 *
 *   node --env-file=.env.local tests/anthropic-ping.mjs
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_SUMMARY_MODEL;
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

if (!apiKey || !model) {
  console.error("חסר ANTHROPIC_API_KEY או ANTHROPIC_SUMMARY_MODEL.");
  process.exit(1);
}
console.log(`מודל: ${model}`);
console.log(`כותרת סביבת עבודה: ${workspaceId ? "נשלחת" : "לא מוגדרת — לא נשלחת"}`);

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
  },
  body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`\n✗ נכשל — HTTP ${response.status}`);
  console.error(body.slice(0, 700));
  process.exit(1);
}
const data = JSON.parse(body);
console.log(`\n✓ המפתח עובד. צריכה: ${data.usage?.input_tokens} קלט, ${data.usage?.output_tokens} פלט.`);
