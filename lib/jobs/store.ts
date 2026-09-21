import { randomUUID } from "node:crypto";
import type { Usage } from "@/lib/cost";

/**
 * מצב העבודות — **בזיכרון התהליך בלבד.**
 *
 * מתאים לאבטיפוס מקומי שמעבד סרטון אחד בכל פעם, ולא לשום דבר מעבר לזה.
 * המשמעות המעשית, ואני מציין אותה כי היא מורגשת מיד: **הפעלה מחדש של השרת
 * מוחקת כל עבודה.** רענון דף אינו מוחק — המזהה נשמר בכתובת, והדף חוזר לאותה
 * עבודה במקום להתחיל חדשה — אבל שרת שעלה מחדש כבר לא מכיר אותה.
 *
 * המסך מבחין בין השניים: עבודה שאינה מוכרת מקבלת הסבר מפורש שהיא אבדה
 * בהפעלה מחדש, ולא הודעת שגיאה כללית.
 */

export type StepName = "upload" | "probe" | "extract" | "transcribe" | "summarize";
export type StepState = "pending" | "running" | "done" | "failed" | "skipped";

export type Step = {
  name: StepName;
  state: StepState;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
};

export type JobStatus = "running" | "done" | "failed" | "cancelled";

export type Summary = {
  topic: string;
  keyPoints: string[];
  spoken: string;
  notDetermined: string[];
};

export type Job = {
  id: string;
  createdAt: number;
  status: JobStatus;
  /** true כשהתוצאות הופקו בלי קריאה בתשלום. מוצג במסך בבירור. */
  mock: boolean;
  fileName: string;
  fileBytes: number;
  durationSeconds: number | null;
  steps: Step[];
  transcript: string | null;
  summary: Summary | null;
  error: string | null;
  /**
   * צריכה בפועל, כפי שהספקים דיווחו — ולא הערכה שלנו. השדות נשארים null
   * כשספק לא החזיר את הנתון, כדי שחוסר מידע ייראה כחוסר ולא כאפס.
   */
  usage: Usage;
  /** קבצים זמניים שנוצרו. מנוקים בסיום ובכישלון כאחד. */
  tempFiles: string[];
};

const STEP_ORDER: StepName[] = ["upload", "probe", "extract", "transcribe", "summarize"];

export const STEP_LABELS: Record<StepName, string> = {
  upload: "קליטת הקובץ",
  probe: "בדיקת אורך ופורמט",
  extract: "חילוץ פס הקול",
  transcribe: "תמלול",
  summarize: "סיכום",
};

const jobs = new Map<string, Job>();

export function createJob(input: { fileName: string; fileBytes: number; mock: boolean }): Job {
  const job: Job = {
    id: randomUUID(),
    createdAt: Date.now(),
    status: "running",
    mock: input.mock,
    fileName: input.fileName,
    fileBytes: input.fileBytes,
    durationSeconds: null,
    steps: STEP_ORDER.map((name) => ({ name, state: "pending" })),
    transcript: null,
    summary: null,
    error: null,
    usage: { audioSeconds: null, inputTokens: null, outputTokens: null },
    tempFiles: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function markStep(id: string, name: StepName, state: StepState, detail?: string): void {
  const job = jobs.get(id);
  if (!job) return;
  const step = job.steps.find((s) => s.name === name);
  if (!step) return;
  step.state = state;
  if (detail !== undefined) step.detail = detail;
  if (state === "running") step.startedAt = Date.now();
  if (state === "done" || state === "failed" || state === "skipped") step.endedAt = Date.now();
}

export function patchJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}

export function addTempFile(id: string, path: string): void {
  jobs.get(id)?.tempFiles.push(path);
}

/**
 * כישלון עוצר את העבודה כולה.
 *
 * השלבים שכבר הסתיימו נשארים כפי שהם — תמלול שהצליח נשאר מוצג גם כשהסיכום
 * נפל. השלבים שלא התחילו מסומנים "לא בוצע" ולא "נכשל", כי הם לא ניסו.
 */
export function failJob(id: string, stepName: StepName, message: string): void {
  const job = jobs.get(id);
  if (!job) return;
  markStep(id, stepName, "failed", message);
  for (const step of job.steps) {
    if (step.state === "pending") step.state = "skipped";
  }
  job.status = "failed";
  job.error = message;
}
