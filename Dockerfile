# Architecture the image is being built *for*. Declared before the first stage so
# the aMule stage -- which deliberately runs on the build platform -- can still
# see it; BuildKit only fills the automatic platform args in at global scope.
ARG TARGETARCH

FROM node:24-bookworm-slim AS nuxt-builder

# Release being built. CI passes the semantic-release version so the built app
# reports the same number as the image tag; local builds fall back to the
# placeholder version in package.json.
ARG APP_VERSION=0.0.0-development
ENV APP_VERSION=${APP_VERSION}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build Nuxt app
RUN npm run build

# aMule daemon stage.
#
# Debian only packages aMule 2.3.3 (2021), so the daemon comes from the upstream
# 3.0.1 release AppImage instead (the project now lives at github.com/amule-org).
# The bundle is unpacked at build time: running an AppImage needs FUSE, which a
# container does not have. Its launcher picks a binary out of the bundle by the
# name it was invoked as, read from ARGV0 -- hence the wrappers further down.
#
# This stage stays on the *build* platform on purpose. Unpacking with unsquashfs
# never executes anything from the bundle, so a cross-build does not have to run
# foreign-architecture binaries here.
#
# Bumping AMULE_VERSION means refreshing BOTH checksums: the release publishes
# one AppImage per architecture and buildx builds those separately.
FROM --platform=${BUILDPLATFORM:-linux/amd64} debian:bookworm-slim AS amule
ARG AMULE_VERSION=3.0.1
ARG AMULE_SHA256_AMD64=fc74df9f66a924a067fa0f0c946561a70e261e4a74bd476cc97a2f6b758b59cf
ARG AMULE_SHA256_ARM64=bc08d102131f77bee5f1c9183959a01773cadb1cef4d9bd18285b8b15dbe0fcb
# Inherited from the global ARG above: this stage runs on the build platform, so
# only the global value tells us which architecture the image is *for*. The
# classic builder sets neither, hence the fallback to the build architecture.
ARG TARGETARCH

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        binutils \
        ca-certificates \
        curl \
        squashfs-tools \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    target_arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
    case "${target_arch}" in \
        amd64) appimage_arch=x64;   sha256="${AMULE_SHA256_AMD64}" ;; \
        arm64) appimage_arch=arm64; sha256="${AMULE_SHA256_ARM64}" ;; \
        *) echo "No aMule AppImage is published for ${target_arch}" >&2; exit 1 ;; \
    esac; \
    file="aMule-${AMULE_VERSION}-Linux-${appimage_arch}.AppImage"; \
    curl -fsSL -o "/tmp/${file}" \
        "https://github.com/amule-org/amule/releases/download/${AMULE_VERSION}/${file}"; \
    echo "${sha256}  /tmp/${file}" | sha256sum -c -; \
    # A type-2 AppImage is an ELF with a squashfs image appended right after the
    # section headers, so the payload offset comes straight out of the ELF header.
    section_start=$(readelf -h "/tmp/${file}" | sed -n 's/.*Start of section headers:[[:space:]]*\([0-9]*\).*/\1/p'); \
    section_size=$(readelf -h "/tmp/${file}" | sed -n 's/.*Size of section headers:[[:space:]]*\([0-9]*\).*/\1/p'); \
    section_count=$(readelf -h "/tmp/${file}" | sed -n 's/.*Number of section headers:[[:space:]]*\([0-9]*\).*/\1/p'); \
    offset=$((section_start + section_size * section_count)); \
    unsquashfs -q -o "${offset}" -d /opt/amule "/tmp/${file}" > /dev/null; \
    rm "/tmp/${file}"; \
    # The GUI binaries are dead weight in a headless image (~35 MB); amuled,
    # amulecmd and amuleweb stay.
    rm -f /opt/amule/usr/bin/amule /opt/amule/usr/bin/amulegui \
          /opt/amule/usr/bin/wxcas /opt/amule/usr/bin/cas \
          /opt/amule/usr/bin/alc /opt/amule/usr/bin/alcc; \
    test -f /opt/amule/usr/bin/amuled

# Final stage
FROM node:24-bookworm-slim

ARG APP_VERSION=0.0.0-development

LABEL maintainer="aMule-Nuxt Project" \
      org.opencontainers.image.title="aMule Nuxt" \
      org.opencontainers.image.description="Web interface for an aMule daemon, with an MCP server" \
      org.opencontainers.image.source="https://github.com/JuanmanDev/amule-nuxt" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}"

# The AppImage bundles its own wxWidgets / crypto++ / boost chain, so nothing
# aMule-related is installed from apt here. libreadline8 is the one exception:
# the bundle leaves it out, and amulecmd / amuleweb refuse to start without it
# (the entrypoint uses amulecmd for its startup check).
# bash is needed because the entrypoint relies on `wait -n`, which dash lacks.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        libreadline8 \
        tzdata \
        wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=amule /opt/amule /opt/amule

# One wrapper per entry point: the bundle's launcher dispatches on ARGV0, and
# `dirname $0` has to stay inside /opt/amule for its own GTK hook to resolve.
RUN set -eux; \
    for binary in amuled amulecmd amuleweb ed2k; do \
        printf '#!/bin/sh\nexec env ARGV0=%s /opt/amule/AppRun "$@"\n' "${binary}" \
            > "/usr/local/bin/${binary}"; \
        chmod +x "/usr/local/bin/${binary}"; \
    done

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
    NODE_ENV=production \
    APP_VERSION=${APP_VERSION}

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
