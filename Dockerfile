# influ-JSON Studio — imagen para deploy online (Google OAuth + SQLite)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
ENV TRUST_PROXY=1

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
