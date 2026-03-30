FROM oven/bun:1-alpine
RUN apk add --no-cache git wget tar
RUN wget -qO /tmp/gl.tar.gz \
      https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz \
    && tar -xzf /tmp/gl.tar.gz -C /usr/local/bin gitleaks \
    && rm /tmp/gl.tar.gz
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production
COPY . .
EXPOSE 3002
CMD ["bun", "src/index.ts"]
