FROM ubuntu:24.04 AS build
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build
FROM ubuntu:24.04
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && useradd --create-home --shell /usr/sbin/nologin node \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
ENV PORT=80
EXPOSE 80
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1/ || exit 1
CMD ["node", "server.mjs"]
