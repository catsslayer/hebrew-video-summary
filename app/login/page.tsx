export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
    <header><h1 className="text-3xl font-semibold">כניסה לניתוח סרטונים</h1><p className="mt-3 text-zinc-500">הכניסה אישית ומגנה על הסרטונים ועל השימוש בשירותי הניתוח.</p></header>
    <form action="/api/login" method="post" className="flex flex-col gap-5 rounded-2xl border border-blue-200 bg-white p-7 text-zinc-900">
      <label className="flex flex-col gap-2">שם משתמש<input name="username" autoComplete="username" defaultValue="yasmin" required dir="ltr" className="rounded-lg border p-3" /></label>
      <label className="flex flex-col gap-2">סיסמה<input name="password" type="password" autoComplete="current-password" required dir="ltr" className="rounded-lg border p-3" /></label>
      {error && <p role="alert" className="text-red-700">שם המשתמש או הסיסמה אינם נכונים. נסי שוב.</p>}
      <button type="submit" className="rounded-lg bg-blue-700 p-3 font-semibold text-white">כניסה</button>
    </form>
    <p className="text-sm text-zinc-500">הסיסמה היא סיסמת הכניסה לאתר, ולא מפתח של ספק AI.</p>
  </main>;
}
