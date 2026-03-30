FROM oven/bun:1-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production
COPY . .
EXPOSE 3002
CMD ["bun", "src/index.ts"]
