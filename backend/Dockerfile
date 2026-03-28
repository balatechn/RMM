FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S rmm && adduser -S rmm -u 1001
COPY --from=builder /app/node_modules ./node_modules
COPY backend/ .
COPY agent/ ./agent/
RUN chown -R rmm:rmm /app
USER rmm
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "src/index.js"]
