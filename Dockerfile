FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node package.json package-lock.json ./
RUN chown node:node /app
USER node
RUN npm ci
COPY --chown=node:node . .
RUN npm run build

FROM node:22.22.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/media-tools && /opt/media-tools/bin/pip install --no-cache-dir "yt-dlp[default]==2026.8.19"
ENV YT_DLP_PATH=/opt/media-tools/bin/yt-dlp
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
