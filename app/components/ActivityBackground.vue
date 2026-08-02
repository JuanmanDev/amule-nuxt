<template>
  <!-- Decorative only: hidden from assistive tech, motion dropped when the system
       asks for reduced motion -->
  <div class="activity-bg" aria-hidden="true">
    <!-- Ambient tint: leans green while uploading, blue while downloading -->
    <div
      class="activity-bg__wash"
      :style="{
        opacity: washOpacity,
        background: `radial-gradient(120% 90% at ${washX}% 0%, var(--activity-down) 0%, transparent 60%),
                     radial-gradient(120% 90% at ${100 - washX}% 100%, var(--activity-up) 0%, transparent 60%)`
      }"
    />

    <svg class="activity-bg__shapes" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- A shape is added or dropped whenever the transfer changes gear, so the
           group it lives in fades rather than blinking in and out -->
      <TransitionGroup tag="g" name="activity-shape" appear>
        <g
          v-for="shape in visual.shapes"
          :key="shape.id"
          class="activity-bg__shape"
          :style="{
            '--left': `${shape.left}`,
            '--size': `${shape.size}`,
            '--duration': `${shape.duration}s`,
            '--delay': `${shape.delay}s`,
            '--spin': `${shape.spin}s`
          }"
        >
          <g :class="`activity-bg__drift activity-bg__drift--${shape.direction}`">
            <!-- Rotation lives on an inner group so drift and spin do not fight -->
            <g class="activity-bg__spin">
              <polygon
                :points="polygonPoints(shape.sides, shape.size)"
                :transform="`translate(${-shape.size / 2} ${-shape.size / 2})`"
                :fill="shape.direction === 'up' ? 'var(--activity-up)' : 'var(--activity-down)'"
                :fill-opacity="shape.opacity"
                :stroke="shape.direction === 'up' ? 'var(--activity-up)' : 'var(--activity-down)'"
                :stroke-opacity="shape.opacity * 1.6"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
                class="activity-bg__polygon"
              />
            </g>
          </g>
        </g>
      </TransitionGroup>
    </svg>
  </div>
</template>

<script setup lang="ts">
/**
 * Background that mirrors what the daemon is doing: polygons rise while
 * uploading and fall while downloading, they spin faster the busier the transfer,
 * one shape is added per transferring file, and the ambient tint leans towards
 * whichever direction currently moves more data.
 *
 * Everything is derived from the shared status, so it costs no extra requests, and
 * placement is deterministic so server and client render the same markup.
 */
import { buildActivityVisual, polygonPoints } from '#shared/utils/activityVisual';

const props = withDefaults(defineProps<{
  uploadSpeed?: number;
  downloadSpeed?: number;
  uploadFiles?: number;
  downloadFiles?: number;
  /** Speed treated as fully busy, in KB/s. */
  fullScale?: number;
}>(), {
  uploadSpeed: 0,
  downloadSpeed: 0,
  uploadFiles: 0,
  downloadFiles: 0,
  fullScale: 2048
});

const visual = computed(() => buildActivityVisual(props));

/** Moves the tint towards the busier direction. */
const washX = computed(() => Math.round(20 + (1 - visual.value.uploadShare) * 60));
const washOpacity = computed(() =>
  (0.06 + Math.max(visual.value.upIntensity, visual.value.downIntensity) * 0.3).toFixed(3)
);
</script>

<style scoped>
.activity-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    /* Success and info from the Nuxt UI palette, with fallbacks */
    --activity-up: var(--ui-color-success-500, #22c55e);
    --activity-down: var(--ui-color-info-500, #3b82f6);
}

.activity-bg__wash {
    position: absolute;
    inset: 0;
    filter: blur(40px);
    transition: opacity 1.5s ease-out, background 2s ease-out;
    will-change: opacity;
}

.activity-bg__shapes {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

/*
 * Fades a shape that the transfer has just added or dropped. Nested opacities
 * multiply in SVG, so this sits on top of the per-cycle fade below without
 * either one having to know about the other.
 */
.activity-bg__shape {
    will-change: opacity;
}

.activity-shape-enter-active,
.activity-shape-leave-active {
    transition: opacity 1.6s ease;
}

.activity-shape-enter-from,
.activity-shape-leave-to {
    opacity: 0;
}

.activity-bg__drift {
    /* The viewBox is 100x100, so left is already a percentage */
    transform: translate(calc(var(--left) * 1px), 0);
    /*
     * Drift and per-cycle fade share the duration and the delay, so the fade is
     * always in step with where the shape is.
     */
    animation-duration: var(--duration), var(--duration);
    animation-delay: var(--delay), var(--delay);
    animation-iteration-count: infinite, infinite;
    animation-timing-function: linear, ease-in-out;
    will-change: transform, opacity;
}

.activity-bg__drift--up {
    animation-name: activity-rise, activity-cycle;
}

.activity-bg__drift--down {
    animation-name: activity-fall, activity-cycle;
}

.activity-bg__spin {
    animation: activity-spin var(--spin) linear infinite;
    transform-box: fill-box;
    transform-origin: center;
}

/* The fill follows the rate, which moves in steps; crossfade so the step is not
   a visible flicker */
.activity-bg__polygon {
    transition: fill-opacity 1.2s ease-out, stroke-opacity 1.2s ease-out;
}

/*
 * The travel margin is the shape's own size rather than a fixed 15 units: a
 * shape is drawn centred on the group, so a smaller margin left the biggest ones
 * still half on screen when the cycle restarted - the shape blinked from the top
 * edge back to the bottom one. A full size clears the rotated diagonal too.
 */
@keyframes activity-rise {
    from { transform: translate(calc(var(--left) * 1px), calc((100 + var(--size)) * 1px)); }
    to { transform: translate(calc(var(--left) * 1px), calc(var(--size) * -1px)); }
}

@keyframes activity-fall {
    from { transform: translate(calc(var(--left) * 1px), calc(var(--size) * -1px)); }
    to { transform: translate(calc(var(--left) * 1px), calc((100 + var(--size)) * 1px)); }
}

/* Belt and braces: even off screen, a shape never arrives or leaves at full
   strength, so a restart cannot read as a pop */
@keyframes activity-cycle {
    0% { opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { opacity: 0; }
}

@keyframes activity-spin {
    from { rotate: 0deg; }
    to { rotate: 360deg; }
}

/* Keep the tint, drop the motion */
@media (prefers-reduced-motion: reduce) {
    .activity-bg__shapes {
        display: none;
    }

    .activity-bg__wash {
        transition: opacity 0.8s ease-out;
    }

    .activity-shape-enter-active,
    .activity-shape-leave-active,
    .activity-bg__polygon {
        transition: none;
    }
}
</style>
