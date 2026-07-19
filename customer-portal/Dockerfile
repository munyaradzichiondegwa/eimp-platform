# ─── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ─── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: development ─────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3002
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["npm", "run", "dev"]

# ─── Stage 4: production (standalone) ────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN addgroup -S eimp && adduser -S eimp -G eimp

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R eimp:eimp /app
USER eimp

EXPOSE 3002
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3002/ 2>/dev/null || exit 1

CMD ["node", "server.js"]
