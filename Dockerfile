FROM node:20-alpine AS nuxt-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Nuxt app
RUN npm run build

# Production stage
FROM alpine:3.22 AS amule-daemon

WORKDIR /tmp

# Install aMule daemon
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing \
    amule amule-daemon amule-utils

# Install runtime dependencies
RUN apk add --no-cache \
    libedit libgcc libintl libpng libstdc++ libupnp musl wxwidgets zlib tzdata pwgen curl \
    && apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing crypto++

# Final stage - combine both
FROM node:20-alpine

LABEL maintainer="aMule-Nuxt Project"

# Install aMule from previous stage
COPY --from=amule-daemon /usr/bin/amuled /usr/bin/
COPY --from=amule-daemon /usr/bin/amulecmd /usr/bin/
COPY --from=amule-daemon /usr/share/amule /usr/share/amule

# Install runtime dependencies for aMule
RUN apk add --no-cache \
    libedit libgcc libintl libpng libstdc++ libupnp musl wxwidgets zlib tzdata \
    && apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing crypto++

# Copy Nuxt build from builder
WORKDIR /app
COPY --from=nuxt-builder /app/.output /app/.output
COPY --from=nuxt-builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

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

# Add startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []
