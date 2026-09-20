import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ניתוח סרטונים — תמלול וסיכום",
  description: "העלאת סרטון, חילוץ פס הקול, תמלול וסיכום בעברית. בלי ניתוח חזותי.",
};

/**
 * `dir="rtl"` יושב על ה-html ולא על עטיפה פנימית, כדי שגם תפריטי הדפדפן,
 * פסי הגלילה וסדר המיקוד יתנהגו כמו בממשק עברי.
 *
 * הגופן הוא מחסנית גופני מערכת עבריים בכוונה: אין כאן הורדת גופן חיצונית,
 * ולכן הממשק נראה זהה גם בלי רשת.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
