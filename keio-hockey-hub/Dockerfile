# =============================================================
# 本番用イメージ。
# standalone 出力を使い、node_modules ごと持ち運ばないようにする。
# =============================================================

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- 依存だけを先に入れる（変更が少ないので層が再利用される） ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- ビルド ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ビルド時に必要な公開値だけを受け取る。秘密情報は実行時に渡す。
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- 実行 ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# root では動かさない
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
