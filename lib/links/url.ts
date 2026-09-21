export type VideoLink = { provider: "YouTube" | "Vimeo"; url: string; id: string };
export function parseVideoLink(value: unknown): VideoLink {
  if (typeof value !== "string" || value.length > 2048) throw new Error("הדביקי קישור תקין לסרטון YouTube או Vimeo.");
  let u: URL;
  try { u = new URL(value.trim()); } catch { throw new Error("הקישור אינו תקין."); }
  if (u.protocol !== "https:" || u.username || u.password || u.port) throw new Error("נדרש קישור HTTPS רגיל של YouTube או Vimeo.");
  const host = u.hostname.toLowerCase();
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(host)) {
    const id = host.endsWith("youtu.be") ? u.pathname.slice(1) : u.pathname === "/watch" ? u.searchParams.get("v") : u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("נדרש קישור לסרטון YouTube יחיד, לא לערוץ או לרשימת צפייה.");
    return { provider: "YouTube", id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = u.pathname.match(/^\/(?:video\/)?(\d{1,12})(?:\/([a-fA-F0-9]{10}))?\/?$/);
    if (!match) throw new Error("נדרש קישור ישיר לסרטון Vimeo יחיד.");
    const hash = match[2] || u.searchParams.get("h");
    if (hash && !/^[a-fA-F0-9]{10}$/.test(hash)) throw new Error("מזהה השיתוף של Vimeo אינו תקין.");
    return { provider: "Vimeo", id: match[1], url: `https://vimeo.com/${match[1]}${hash ? "/" + hash : ""}` };
  }
  throw new Error("כרגע נתמכים רק קישורים ישירים של YouTube ו-Vimeo.");
}
