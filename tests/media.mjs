/**
 * בדיקה מקומית של זיהוי הסרטון וחילוץ האודיו — **בלי אף קריאה לספק**.
 *
 * הבדיקה מריצה את הפונקציות האמיתיות מ-`lib/media/ffmpeg.ts` ולא מעתיקה את
 * הארגומנטים של ffmpeg לכאן. העתקה הייתה בודקת את מה שכתבתי בבדיקה, ולא את מה
 * שהקוד באמת מריץ.
 *
 *   node tests/media.mjs <תיקיית-קבצי-בדיקה>
 */
import { readFileSync } from "node:fs";
import { stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createContext, runInContext } from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const run = promisify(execFile);
const fixtures = process.argv[2];
assert(fixtures, "צריך נתיב לתיקיית קובצי הבדיקה");

// טעינת מודול TypeScript עם ה-alias של @/. בלי המיפוי הזה הטעינה נופלת על
// "Cannot find module '@/lib/config'" עוד לפני שרצה משפט בדיקה אחד.
function load(path) {
  const source = ts.transpileModule(readFileSync(path + ".ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = createContext({
    exports,
    require: (name) => (name.startsWith("@/") ? load(name.slice(2)) : require(name)),
    process,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
  });
  runInContext(source, context);
  return exports;
}

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

const media = load("lib/media/ffmpeg");
const config = load("lib/config");

/** קריאת מאפייני מסלול מתוך קובץ, כדי לאמת את מה שנוצר בפועל. */
async function streamInfo(path, entries) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", entries,
    "-of", "default=nw=1",
    path,
  ]);
  return Object.fromEntries(
    stdout.trim().split("\n").filter(Boolean).map((line) => line.split("="))
  );
}

let passed = 0;
async function check(name, body) {
  await body();
  passed++;
  console.log("PASS", name);
}

await check("הכלים זמינים", async () => {
  assert.equal(await media.toolsAvailable(), true);
});

await check("אורך של סרטון אמיתי נמדד נכון", async () => {
  const seconds = await media.probeDuration(join(fixtures, "real-12s.mp4"), 30_000);
  assert.ok(Math.abs(seconds - 12) < 0.5, `התקבל ${seconds}`);
});

await check("סרטון ארוך נמדד מעל המגבלה", async () => {
  const seconds = await media.probeDuration(join(fixtures, "too-long.mp4"), 30_000);
  assert.ok(seconds > config.MAX_DURATION_SECONDS, `${seconds} אמור לחרוג מהמגבלה`);
});

await check("קובץ שאינו וידאו נדחה, למרות הסיומת", async () => {
  await assert.rejects(
    () => media.probeDuration(join(fixtures, "fake.mp4"), 30_000),
    (error) => {
      // ההודעה היא שלנו ובעברית, ולא פלט גולמי של ffprobe.
      assert.match(error.message, /לא ניתן לקרוא את אורך הסרטון/);
      return true;
    }
  );
});

await check("חילוץ אודיו מייצר mp3 מונו ב-16kHz, בלי מסלול וידאו", async () => {
  const output = join(fixtures, "extracted.mp3");
  await rm(output, { force: true });
  await media.extractAudio(join(fixtures, "real-12s.mp4"), output, 180_000);

  const size = (await stat(output)).size;
  assert.ok(size > 0, "הקובץ ריק");
  assert.ok(size < config.MAX_AUDIO_BYTES, "האודיו חורג מתקרת הספק");

  const info = await streamInfo(
    output,
    "stream=codec_type,codec_name,channels,sample_rate:format=duration"
  );
  assert.equal(info.codec_type, "audio");
  assert.equal(info.codec_name, "mp3");
  assert.equal(info.channels, "1", "אמור להיות מונו");
  assert.equal(info.sample_rate, "16000", "אמור להיות 16kHz");
  assert.ok(Math.abs(Number(info.duration) - 12) < 0.5, `אורך האודיו ${info.duration}`);

  // אין שום מסלול וידאו בפלט: `-vn` עשה את שלו.
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-select_streams", "v",
    "-show_entries", "stream=index", "-of", "csv=p=0", output,
  ]);
  assert.equal(stdout.trim(), "", "נמצא מסלול וידאו בפלט האודיו");

  console.log(
    `      ${(size / 1024).toFixed(0)}KB, ${info.channels} ערוץ, ` +
    `${info.sample_rate}Hz, ${Number(info.duration).toFixed(1)} שניות`
  );
});

await check("סרטון בלי מסלול אודיו נכשל בהודעה מפורשת", async () => {
  await assert.rejects(
    () => media.extractAudio(join(fixtures, "no-audio.mp4"), join(fixtures, "none.mp3"), 60_000),
    (error) => {
      assert.ok(error.message.length > 0);
      console.log("      ההודעה:", error.message);
      return true;
    }
  );
});

await check("תקרת זמן עוצרת את ffmpeg ולא נשאר תהליך תלוי", async () => {
  const before = await countFfmpeg();
  await assert.rejects(
    () => media.extractAudio(join(fixtures, "too-long.mp4"), join(fixtures, "timeout.mp3"), 250),
    (error) => {
      assert.match(error.message, /מגבלת הזמן/);
      return true;
    }
  );
  // SIGKILL אינו מיידי מבחינת טבלת התהליכים; המתנה קצרה לפני הספירה.
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(await countFfmpeg(), before, "נשאר תהליך ffmpeg רץ");
});

async function countFfmpeg() {
  const { stdout } = await run("/bin/sh", [
    "-c",
    "ps -Ao command= | grep -c '[f]fmpeg -hide_banner' || true",
  ]);
  return Number(stdout.trim());
}

await rm(join(fixtures, "extracted.mp3"), { force: true });
await rm(join(fixtures, "timeout.mp3"), { force: true });
console.log(`\n${passed} בדיקות עברו. לא בוצעה אף קריאה לספק חיצוני.`);
