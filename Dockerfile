FROM node:22-bookworm-slim AS nuxt-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Nuxt app
RUN npm run build

# Final stage
FROM node:22-bookworm-slim

LABEL maintainer="aMule-Nuxt Project"

# aMule was removed from the Alpine package tree, so the daemon comes from
# Debian instead: apt resolves the wxWidgets/crypto++ runtime chain itself,
# which the old hand-copied binary approach had to reproduce by hand.
# bash is needed because the entrypoint relies on `wait -n`, which dash lacks.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        amule-daemon \
        amule-utils \
        bash \
        ca-certificates \
        tzdata \
        wget \
    && rm -rf /var/lib/apt/lists/*

# Copy Nuxt build from builder. Nitro bundles every runtime dependency into
# .output/server/node_modules, so the image needs no npm install of its own.
WORKDIR /app
COPY --from=nuxt-builder /app/.output /app/.output
COPY --from=nuxt-builder /app/package*.json ./

# Create aMule directories
RUN mkdir -p /home/amule/.aMule /downloads/incoming /downloads/temp

# Environment variables with defaults
ENV AMULE_EC_PASSWORD=amule \
    AMULE_EC_PORT=4712 \
    NUXT_PORT=3000 \
    NODE_ENV=production

# Expose ports
# 3000: Nuxt web interface
# 4712: aMule External Connection
# 4662: aMule eD2k
# 4665/udp: aMule UD2k
# 4672/udp: aMule Kad
EXPOSE 3000 4712 4662 4665/udp 4672/udp

# Fail the container health check if the web UI stops responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${NUXT_PORT}/" >/dev/null 2>&1 || exit 1

# Add startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []
