# Builds both published images in one BuildKit run.
#
# `web` is a prefix stage of `full` (full inherits FROM web), so a single bake
# builds the Nuxt output, the apt layer and the app layer once and both images
# reuse them. Two separate `docker build` invocations would repeat that work even
# with a warm cache, and would set up QEMU and the builder twice in CI.
#
#   docker buildx bake                    both images, local platform
#   docker buildx bake full               the all-in-one image only
#   docker buildx bake --print            the resolved plan, without building
#
# CI passes the tag lists it derived from the release version:
#   docker buildx bake --push --set '*.platform=linux/amd64,linux/arm64'

variable "APP_VERSION" {
  default = "0.0.0-development"
}

variable "REVISION" {
  default = ""
}

# Comma separated, because bake variables are strings. Empty means "no tag",
# which is what a plain local `docker buildx bake` wants.
variable "TAGS_FULL" {
  default = "amule-nuxt:local"
}

variable "TAGS_WEB" {
  default = "amule-nuxt-web:local"
}

variable "PLATFORMS" {
  default = ""
}

group "default" {
  targets = ["full", "web"]
}

target "common" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = PLATFORMS == "" ? null : split(",", PLATFORMS)

  args = {
    APP_VERSION = APP_VERSION
  }

  labels = {
    "org.opencontainers.image.version"  = APP_VERSION
    "org.opencontainers.image.revision" = REVISION
  }
}

# The daemon and the app together: the default image, and the one a split
# deployment uses for its daemon container.
target "full" {
  inherits = ["common"]
  target   = "full"
  tags     = compact(split(",", TAGS_FULL))

  # Both scopes are read by both targets: everything `web` builds is also a layer
  # of `full`, so whichever ran first warms the other. They write to their own
  # scope so two concurrent exports cannot clobber each other.
  cache-from = ["type=gha,scope=full", "type=gha,scope=web"]
  cache-to   = ["type=gha,scope=full,mode=max"]
}

# The app on its own, for a daemon that already exists elsewhere.
target "web" {
  inherits = ["common"]
  target   = "web"
  tags     = compact(split(",", TAGS_WEB))

  cache-from = ["type=gha,scope=web", "type=gha,scope=full"]
  cache-to   = ["type=gha,scope=web,mode=max"]
}
