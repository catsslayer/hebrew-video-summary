import { requireAccess } from "@/lib/server-access";
import { parseVideoLink } from "@/lib/links/url";
import { createJob } from "@/lib/jobs/store";
import { runLinkPipeline } from "@/lib/jobs/link-pipeline";
import { isMockMode } from "@/lib/config";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied=requireAccess(request); if(denied)return denied;
  let input: { url?: unknown; rightsConfirmed?: boolean };
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error();
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>4096){await reader.cancel();return Response.json({error:"הבקשה גדולה מדי."},{status:413});}chunks.push(value);}
    input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{return Response.json({error:"הבקשה אינה תקינה."},{status:400});}
  if(input?.rightsConfirmed!==true)return Response.json({error:"נדרש אישור שיש לך זכות להשתמש בסרטון."},{status:400});
  try {
    const link=parseVideoLink(input.url);
    const job=createJob({fileName:`סרטון מ-${link.provider}`,fileBytes:0,mock:isMockMode()});
    void runLinkPipeline(job.id,link);
    return Response.json({jobId:job.id,mock:job.mock},{status:202});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"הקישור אינו תקין."},{status:400});}
}
