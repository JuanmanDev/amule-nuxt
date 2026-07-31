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
      <g
        v-for="shape in visual.shapes"
        :key="shape.id"
        :class="`activity-bg__drift activity-bg__drift--${shape.direction}`"
        :style="{
          '--left': `${shape.left}`,
          '--duration': `${shape.duration}s`,
          '--delay': `${shape.delay}s`
        }"
      >
        <!-- Rotation lives on an inner group so drift and spin do not fight -->
        <g
          class="activity-bg__spin"
          :style="{ '--spin': `${shape.spin}s`, '--size': `${shape.size}` }"
        >
          <polygon
            :points="polygonPoints(shape.sides, shape.size)"
            :transform="`translate(${-shape.size / 2} ${-shape.size / 2})`"
            :fill="shape.direction === 'up' ? 'var(--activity-up)' : 'var(--activity-down)'"
            :fill-opacity="shape.opacity"
            :stroke="shape.direction === 'up' ? 'var(--activity-up)' : 'var(--activity-down)'"
            :stroke-opacity="shape.opacity * 2"
            stroke-width="1.2"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>
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

.activity-bg__drift {
    /* The viewBox is 100x100, so left is already a percentage */
    transform: translate(calc(var(--left) * 1px), 0);
    animation-duration: var(--duration);
    animation-delay: var(--delay);
    animation-iteration-count: infinite;
    animation-timing-function: linear;
    will-change: transform;
}

.activity-bg__drift--up {
    animation-name: activity-rise;
}

.activity-bg__drift--down {
    animation-name: activity-fall;
}

.activity-bg__spin {
    animation: activity-spin var(--spin) linear infinite;
    transform-box: fill-box;
    transform-origin: center;
}

@keyframes activity-rise {
    from { transform: translate(calc(var(--left) * 1px), 115px); }
    to { transform: translate(calc(var(--left) * 1px), -15px); }
}

@keyframes activity-fall {
    from { transform: translate(calc(var(--left) * 1px), -15px); }
    to { transform: translate(calc(var(--left) * 1px), 115px); }
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
}
</style>
