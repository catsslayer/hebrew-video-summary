# Railway deployment - 2026-09-21

Live URL: https://hebrew-video-summary-production.up.railway.app
Repository: https://github.com/catsslayer/hebrew-video-summary
Deployed application commit: 58fe6a3.
Deployment: d20ac7b2-db23-4f59-851e-cfb3c54245dd (SUCCESS).
Deployment method: Railway CLI upload, not GitHub automatic deploy.

Production has MOCK_PROVIDERS=false and requires Basic authentication over HTTPS.
Credentials are held in Railway Variables and the local, ignored .env.railway.local; never in this repository.
The original .env.local was not changed.

## Verified on the public HTTPS deployment

- Health endpoint returned 200; ffmpeg and ffprobe available.
- Homepage and all three job API routes rejected unauthenticated requests with 401.
- Authenticated homepage returned 200.
- A cross-origin paid request was rejected with 403.
- One complete mock job succeeded before real mode was enabled.
- One authorized real job succeeded through the browser: upload, probe, extract, transcription and summary.
- Input: a newly generated 22-second synthetic Hebrew speech test video, not a private customer video.
- Groq reported 16.346937344 seconds of audio; Anthropic reported 495 input tokens and 402 output tokens.
- Cost calculated using the application's recorded rate card: $0.0026866326, displayed as $0.0027; below the approved $0.02 ceiling.
- Hebrew RTL and the actual rendered result were inspected. The screenshot is retained outside this repository for the presentation.
- The transcript still has spelling substitutions (e.g. קול -> כל). No claim of perfect transcription or human-voice verification.
- No automatic or additional paid retry was performed.

## Known boundaries

The workspace was on a trial showing 30 days or $5.00 credit. No paid subscription was purchased; continued hosting after the trial requires an account decision.
This is a single-owner prototype with one replica. Jobs live in memory and disappear on restart or redeployment. Raw media is cleaned after processing.
Local file input only; no YouTube/Vimeo integration, watch skill, visual analysis or human-voice test.
Railway currently accepts railway.json but warns it is deprecated and will stop working on 2026-12-01; migrate to Railway Infrastructure as Code before that date.
Neither Yasmin CRM nor Revive AI Social was modified.
