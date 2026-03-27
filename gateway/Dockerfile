FROM oven/bun:1.2-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 gateway

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=gateway:bunjs . .

USER gateway
EXPOSE 3001
ENV PORT=3001

CMD ["bun", "run", "src/index.ts"]
