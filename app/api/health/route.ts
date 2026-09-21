import { toolsAvailable } from "@/lib/media/ffmpeg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mediaReady = await toolsAvailable();
  const accessReady = (process.env.APP_PASSWORD?.length ?? 0) >= 20;
  const providersReady = process.env.MOCK_PROVIDERS === "true" ||
    Boolean(process.env.GROQ_API_KEY && process.env.ANTHROPIC_API_KEY);
  const ready = mediaReady && accessReady && providersReady;
  return Response.json({ status: ready ? "ok" : "not_ready" }, {
    status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" },
  });
}
