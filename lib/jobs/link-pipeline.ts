import { downloadVideoLink } from "@/lib/links/download";
import type { VideoLink } from "@/lib/links/url";
import { cleanup, runPipeline, workDirFor } from "./pipeline";
import { addTempFile, failJob, markStep, patchJob } from "./store";

export async function runLinkPipeline(id: string, link: VideoLink) {
  try {
    markStep(id,"upload","running",`קליטת סרטון מ-${link.provider}`);
    addTempFile(id,workDirFor(id));
    const media=await downloadVideoLink(link,workDirFor(id));
    patchJob(id,{fileName:media.title,fileBytes:media.bytes});
    markStep(id,"upload","done",`התקבל מ-${link.provider}`);
    await runPipeline(id,media.path);
  } catch(error) {
    failJob(id,"upload",error instanceof Error ? error.message : "קליטת הקישור נכשלה.");
    await cleanup(id);
  }
}
