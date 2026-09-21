"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, StepName, StepState } from "@/lib/jobs/store";
import { computeCost, formatUsd } from "@/lib/cost";

/**
 * מסך הניתוח.
 *
 * שתי החלטות שמנחות את המסך:
 *
 * 1. **מזהה העבודה יושב בכתובת.** רענון דף קורא את המזהה וחוזר לאותה עבודה,
 *    ולא מתחיל ניתוח חדש. ניתוח מתחיל רק בלחיצה מפורשת.
 * 2. **עבודה שאינה מוכרת אינה "שגיאה".** המצב נשמר בזיכרון התהליך, ולכן
 *    הפעלה מחדש של השרת מוחקת אותו. המסך אומר את זה במילים במקום להציג כשל.
 */

type JobView = Omit<Job, "tempFiles">;

const STEP_LABELS: Record<StepName, string> = {
  upload: "קליטת הקובץ",
  probe: "בדיקת אורך ותקינות",
  extract: "חילוץ פס הקול",
  transcribe: "תמלול",
  summarize: "סיכום",
};

const STATE_LABELS: Record<StepState, string> = {
  pending: "ממתין",
  running: "בעבודה",
  done: "הושלם",
  failed: "נכשל",
  skipped: "לא בוצע",
};

const STATE_STYLES: Record<StepState, string> = {
  pending: "text-zinc-400 dark:text-zinc-500",
  running: "text-blue-700 dark:text-blue-300",
  done: "text-emerald-700 dark:text-emerald-300",
  failed: "text-red-700 dark:text-red-300",
  skipped: "text-zinc-400 dark:text-zinc-500",
};

function StepIcon({ state }: { state: StepState }) {
  const glyph =
    state === "done" ? "✓" : state === "failed" ? "✕" : state === "running" ? "●" : "○";
  return (
    <span aria-hidden className={`w-5 shrink-0 text-center ${STATE_STYLES[state]}`}>
      {glyph}
    </span>
  );
}

export default function Analyzer() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [lost, setLost] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /** קריאת המזהה מהכתובת. רענון חוזר לעבודה קיימת במקום לפתוח חדשה. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("job");
    if (fromUrl) setJobId(fromUrl);
  }, []);

  const poll = useCallback(async (id: string) => {
    const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    if (response.status === 404) {
      setLost(true);
      setJob(null);
      return true;
    }
    if (!response.ok) return false;
    const data: JobView = await response.json();
    setJob(data);
    setLost(false);
    return data.status !== "running";
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      let finished = false;
      try {
        finished = await poll(jobId);
      } catch {
        // תקלת רשת רגעית אינה עוצרת את המעקב.
      }
      if (!stopped && !finished) timer = setTimeout(tick, 1200);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, poll]);

  async function startAnalysis(file: File) {
    setUploadError(null);
    setUploading(true);
    setLost(false);
    setJob(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/jobs", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setUploadError(data?.error ?? "ההעלאה נכשלה.");
        return;
      }
      // המזהה נכנס לכתובת לפני כל דבר אחר, כדי שרענון באמצע העיבוד יחזור
      // לאותה עבודה ולא יתחיל אחת נוספת.
      const url = new URL(window.location.href);
      url.searchParams.set("job", data.jobId);
      window.history.replaceState(null, "", url);
      setJobId(data.jobId);
    } catch {
      setUploadError("לא הצלחנו לשלוח את הקובץ לשרת.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * ניסיון נוסף לסיכום בלבד, מהתמלול שכבר שולם עליו.
   *
   * נקרא רק מלחיצה. הכפתור מושבת בזמן הבקשה, כדי ששתי לחיצות לא ייצרו שתי
   * קריאות בתשלום על אותו תמלול.
   */
  async function retrySummary() {
    if (!jobId || retrying) return;
    setRetrying(true);
    try {
      await fetch(`/api/jobs/${jobId}/summarize`, { method: "POST" });
      await poll(jobId);
    } catch {
      // המצב נקרא ממילא מהמעקב; אין כאן מה להציג בנפרד.
    } finally {
      setRetrying(false);
    }
  }

  function reset() {
    const url = new URL(window.location.href);
    url.searchParams.delete("job");
    window.history.replaceState(null, "", url);
    setJobId(null);
    setJob(null);
    setLost(false);
    setUploadError(null);
    setShowTranscript(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const busy = uploading || job?.status === "running";

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------ בחירת קובץ */}
      {!jobId && (
        <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void startAnalysis(file);
            }}
            className="mx-auto block text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-white disabled:opacity-50 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            MP4, MOV, WebM או MKV · עד 200MB · עד 10 דקות
          </p>
          {uploading && (
            <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">הקובץ נשלח לשרת…</p>
          )}
          {uploadError && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {uploadError}
            </p>
          )}
        </section>
      )}

      {/* ------------------------------------- עבודה שאבדה בהפעלה מחדש */}
      {lost && (
        <section
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm dark:border-amber-800 dark:bg-amber-950"
        >
          <h2 className="font-semibold text-amber-900 dark:text-amber-100">
            העבודה הזו כבר לא קיימת בשרת
          </h2>
          <p className="mt-2 text-amber-900/90 dark:text-amber-100/90">
            מצב העבודות נשמר בזיכרון התהליך בלבד, ולכן הפעלה מחדש של השרת מוחקת אותו. זו
            אינה תקלה אלא מגבלה מוכרת של האבטיפוס המקומי. התמלול והסיכום אינם ניתנים לשחזור,
            והקובץ הזמני כבר נמחק — צריך להעלות את הסרטון שוב.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-lg bg-amber-900 px-4 py-2 text-white dark:bg-amber-100 dark:text-amber-950"
          >
            התחלה מחדש
          </button>
        </section>
      )}

      {/* ------------------------------------------------------- מצב השלבים */}
      {job && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">שלבי העיבוד</h2>
            {job.mock && (
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-900 dark:bg-violet-900 dark:text-violet-100">
                מצב מדומה — לא בוצעו קריאות בתשלום
              </span>
            )}
          </div>

          <ol className="mt-4 flex flex-col gap-2 text-sm">
            {job.steps.map((step) => (
              <li key={step.name} className="flex items-start gap-3">
                <StepIcon state={step.state} />
                <span className="w-40 shrink-0">{STEP_LABELS[step.name]}</span>
                <span className={STATE_STYLES[step.state]}>{STATE_LABELS[step.state]}</span>
                {step.detail && (
                  <span className="text-zinc-500 dark:text-zinc-400">— {step.detail}</span>
                )}
              </li>
            ))}
          </ol>

          {job.status === "failed" && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100"
            >
              <p className="font-medium">העיבוד נעצר.</p>
              <p className="mt-1">{job.error}</p>
              <p className="mt-2 text-red-800/80 dark:text-red-200/80">
                לא בוצע ניסיון חוזר אוטומטי. תמלול וסיכום הם קריאות בתשלום, וניסיון נוסף
                נעשה רק בבחירה מפורשת.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {job.transcript && !job.summary && (
                  <button
                    type="button"
                    onClick={() => void retrySummary()}
                    disabled={retrying}
                    className="rounded-lg bg-red-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-red-100 dark:text-red-950"
                  >
                    {retrying ? "מסכם…" : "ניסיון נוסף לסיכום בלבד"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-red-900 px-4 py-2 text-red-900 dark:border-red-200 dark:text-red-100"
                >
                  בחירת קובץ חדש
                </button>
              </div>
              {job.transcript && !job.summary && (
                <p className="mt-2 text-xs text-red-800/80 dark:text-red-200/80">
                  התמלול כבר הושלם ושמור. ניסיון נוסף מסכם אותו ואינו משלם שוב על התמלול.
                </p>
              )}
            </div>
          )}

          {busy && job.status === "running" && (
            <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
              אפשר לרענן את הדף — הרענון חוזר לאותה עבודה ואינו מתחיל ניתוח נוסף.
            </p>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ סיכום */}
      {job?.summary && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">סיכום</h2>

          <h3 className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">נושא</h3>
          <p className="mt-1">{job.summary.topic}</p>

          <h3 className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            נקודות עיקריות
          </h3>
          <ul className="mt-1 list-disc pr-5">
            {job.summary.keyPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>

          <h3 className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            מה נאמר
          </h3>
          <p className="mt-1 whitespace-pre-wrap">{job.summary.spoken}</p>

          <h3 className="mt-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            מה לא ניתן היה לקבוע
          </h3>
          <ul className="mt-1 list-disc pr-5 text-zinc-700 dark:text-zinc-300">
            {job.summary.notDetermined.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------- עלות בפועל */}
      {job && !job.mock && job.usage.audioSeconds !== null && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">עלות בפועל</h2>
          {(() => {
            const cost = computeCost(job.usage);
            return (
              <>
                <ul className="mt-3 flex flex-col gap-1 text-zinc-700 dark:text-zinc-300">
                  <li>
                    תמלול — {job.usage.audioSeconds.toFixed(1)} שניות אודיו:{" "}
                    <span className="ltr-inline">
                      {cost.transcribeUsd === null ? "לא דווח" : formatUsd(cost.transcribeUsd)}
                    </span>
                  </li>
                  <li>
                    סיכום — {job.usage.inputTokens ?? "?"} טוקני קלט,{" "}
                    {job.usage.outputTokens ?? "?"} טוקני פלט:{" "}
                    <span className="ltr-inline">
                      {cost.summarizeUsd === null ? "לא דווח" : formatUsd(cost.summarizeUsd)}
                    </span>
                  </li>
                </ul>
                <p className="mt-3 font-medium">
                  סה״כ:{" "}
                  <span className="ltr-inline">
                    {cost.totalUsd === null ? "לא ניתן לחשב" : formatUsd(cost.totalUsd)}
                  </span>
                  {cost.partial && " (חלקי — ספק אחד לא דיווח צריכה)"}
                </p>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  מחושב מהצריכה שהספקים דיווחו, לפי המחירים שנבדקו ב-21.9.2026. זו מדידה
                  ולא אומדן, אך המחירים עצמם עשויים להשתנות.
                </p>
              </>
            );
          })()}
        </section>
      )}

      {/* ----------------------------------------------------------- תמלול */}
      {job?.transcript && (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setShowTranscript((open) => !open)}
            className="text-sm font-medium underline"
          >
            {showTranscript ? "הסתרת התמלול המלא" : "הצגת התמלול המלא"}
          </button>
          {showTranscript && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{job.transcript}</p>
          )}
        </section>
      )}

      {job && job.status !== "running" && (
        <button
          type="button"
          onClick={reset}
          className="self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          ניתוח סרטון נוסף
        </button>
      )}
    </div>
  );
}
