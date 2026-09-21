import Analyzer from "@/components/Analyzer";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">ניתוח סרטונים</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          העלאת סרטון מהמחשב, חילוץ פס הקול, תמלול וסיכום בעברית.
        </p>
      </header>

      {/*
        ההבהרה הזו אינה הערת שוליים. סיכום שנשמע בטוח יוצר רושם שהמערכת "צפתה"
        בסרטון, והיא לא: היא קראה את מה שנאמר בלבד.
      */}
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm dark:border-blue-900 dark:bg-blue-950">
        <h2 className="font-semibold text-blue-950 dark:text-blue-50">
          בשלב הזה אין ניתוח חזותי
        </h2>
        <p className="mt-2 text-blue-950/90 dark:text-blue-50/90">
          המערכת מנתחת <strong>את פס הקול בלבד</strong>. לא מחולצים פריימים, לא נשלחת אף
          תמונה לשום מודל, ואף שלב אינו &quot;צופה&quot; בסרטון. לכן הסיכום יודע מה נאמר,
          אבל אינו יודע מה מוצג על המסך — טקסט על שקף, גרף, כתוביות צרובות או פעולה שבוצעה
          בלי שנאמרה בקול לא ייכללו בו.
        </p>
      </section>

      <Analyzer />

      <footer className="mt-4 text-xs leading-6 text-zinc-500 dark:text-zinc-400">
        אבטיפוס אישי. מצב העבודות נשמר בזיכרון התהליך, והסרטון והאודיו נמחקים מהדיסק בתום
        העיבוד — בהצלחה ובכישלון כאחד. אין ניסיונות חוזרים אוטומטיים בתשלום.
      </footer>
    </main>
  );
}
