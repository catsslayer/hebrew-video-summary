import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DURATION_SECONDS, MAX_UPLOAD_BYTES } from "@/lib/config";
import { parseVideoLink, type VideoLink } from "./url";

const COMMON = ["--ignore-config", "--no-playlist", "--no-cache-dir", "--no-warnings", "--no-progress", "--no-geo-bypass", "--retries", "0", "--fragment-retries", "0", "--socket-timeout", "15", "--use-extractors", "Youtube,Vimeo", "--js-runtimes", "node", "--no-remote-components"];
const unavailable = "לא ניתן לקרוא את הסרטון מהקישור. ייתכן שהוא פרטי, דורש כניסה או שהאתר חוסם את הגישה. אפשר להעלות את הקובץ מהמחשב במקום זאת.";

export function validateMetadata(data: Record<string, unknown>): { title: string; duration: number } {
  if (data._type === "playlist" || data.is_live === true || ["is_live", "is_upcoming", "post_live"].includes(String(data.live_status))) throw new Error("שידור חי ורשימת צפייה אינם נתמכים. בחרי סרטון יחיד שהסתיים.");
  const duration = data.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) throw new Error("לא ניתן לאמת את אורך הסרטון. אפשר להעלות את הקובץ מהמחשב.");
  if (duration > MAX_DURATION_SECONDS) throw new Error("הסרטון ארוך מ-10 דקות. בחרי סרטון קצר יותר.");
  return { title: String(data.title || "סרטון מקישור").slice(0,200), duration };
}

async function directoryBytes(dir: string): Promise<number> {
  const names = await readdir(dir).catch(() => []);
  let total = 0;
  for (const name of names) { const s = await stat(join(dir,name)); if (s.isFile()) total += s.size; }
  return total;
}

function run(args: string[], ms: number, dir?: string): Promise<string> {
  return new Promise((resolve,reject) => {
    const child = spawn(/* turbopackIgnore: true */ process.env.YT_DLP_PATH || "yt-dlp", args, { detached: true, stdio: ["ignore","pipe","pipe"] });
    let out = "", err = "", failure: Error | null = null, checking = false;
    const stop = (message: string) => {
      if (failure) return;
      failure = new Error(message);
      try { if(child.pid) process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    };
    const timer = setTimeout(() => stop("קליטת הקישור חרגה ממגבלת הזמן ונעצרה. נסי להעלות קובץ מהמחשב."), ms);
    const monitor = dir ? setInterval(async () => {
      if(checking) return; checking=true;
      try { if(await directoryBytes(dir)>MAX_UPLOAD_BYTES) stop("הקובץ מהקישור חורג ממגבלת 200MB."); }
      catch { stop("לא ניתן לשמור את הסרטון."); }
      finally { checking=false; }
    }, 200) : undefined;
    const clear = () => {clearTimeout(timer);if(monitor)clearInterval(monitor);};
    child.stdout.on("data", b => { out += b.toString(); if(out.length>8*1024*1024) stop("תשובת המקור גדולה מדי."); });
    child.stderr.on("data", b => { err = (err+b.toString()).slice(-4000); });
    child.on("error", () => {clear();reject(new Error("כלי קליטת הקישורים אינו זמין בשרת."));});
    child.on("close", code => {
      clear();
      if(failure) return reject(failure);
      if(code!==0) {
        // Do not log URLs, unlisted hashes, cookies or raw provider responses.
        const reason = /403|forbidden/i.test(err) ? "blocked" : /private|login|sign in|password/i.test(err) ? "restricted" : "unavailable";
        console.error(`[video-link] ${reason}`);
        return reject(new Error(unavailable));
      }
      resolve(out);
    });
  });
}

export async function inspectVideoLink(link: VideoLink) {
  const safe = parseVideoLink(link.url);
  const raw = await run([...COMMON,"--skip-download","--dump-single-json","--",safe.url],45_000);
  let data: Record<string,unknown>;
  try {data=JSON.parse(raw);}catch {throw new Error(unavailable);}
  return validateMetadata(data);
}

export async function downloadVideoLink(link: VideoLink, dir: string): Promise<{path:string;title:string;bytes:number}> {
  const safe = parseVideoLink(link.url);
  const metadata = await inspectVideoLink(safe);
  await mkdir(dir,{recursive:true});
  await run([...COMMON,"--max-filesize",String(MAX_UPLOAD_BYTES),"--match-filter",`!is_live & duration <= ${MAX_DURATION_SECONDS}`,"-f","worst[acodec!=none][vcodec!=none]/worstaudio","-o",join(dir,"source.%(ext)s"),"--",safe.url],180_000,dir);
  const files = (await readdir(dir)).filter(name=>/^source\.[a-zA-Z0-9]+$/.test(name)&&!name.endsWith('.part')&&!name.endsWith('.ytdl'));
  if(files.length!==1)throw new Error("לא התקבל קובץ מדיה תקין מהקישור. אפשר להעלות קובץ מהמחשב.");
  const path=join(dir,files[0]);const bytes=(await stat(path)).size;
  if(bytes===0 || bytes>MAX_UPLOAD_BYTES)throw new Error("הקובץ מהקישור ריק או חורג ממגבלת 200MB.");
  return {path,title:metadata.title,bytes};
}
