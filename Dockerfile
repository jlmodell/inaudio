# Self-hosted Inaudio. Speech models download into /data on first start unless
# you already mounted a populated volume.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    INAUDIO_DATA=/data \
    INAUDIO_HOST=0.0.0.0 \
    INAUDIO_PORT=8080 \
    INAUDIO_ASSETS=/app/assets \
    INAUDIO_WEB_ROOT=/app/out/web
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/out /app/out
COPY assets/models /app/assets/models
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "out/server/index.mjs"]
