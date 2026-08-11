<template>
  <!-- Decorative only: hidden from assistive tech, motion dropped when the system
       asks for reduced motion or the user turned it down in Settings -->
  <div v-if="mode !== 'off'" class="activity-bg" aria-hidden="true">
    <!-- Two fixed gradients whose opacity follows each direction. Only the opacity
         changes, so a rate update never repaints the layer, it just recomposites -->
    <div class="activity-bg__wash activity-bg__wash--down" :style="{ opacity: downWash }" />
    <div class="activity-bg__wash activity-bg__wash--up" :style="{ opacity: upWash }" />

    <!-- A shape is added or dropped whenever the transfer changes gear, so the
         group it lives in fades rather than blinking in and out -->
    <TransitionGroup v-if="mode === 'animated'" tag="div" class="activity-bg__shapes" name="activity-shape" appear>
      <div
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
        <div :class="`activity-bg__drift activity-bg__drift--${shape.direction}`">
          <!-- Rotation lives on an inner element so drift and spin do not fight -->
          <div class="activity-bg__spin">
            <div
              :class="`activity-bg__polygon activity-bg__polygon--${shape.direction}`"
              :style="{ clipPath: CLIP_PATHS[shape.sides], opacity: shape.opacity }"
            />
          </div>
        </div>
      </div>
    </TransitionGroup>
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
 *
 * It is built to cost the GPU as little as possible:
 *
 *  * Only `transform` and `opacity` are ever animated, so every frame runs on the
 *    compositor and the main thread stays free for the app.
 *  * The shapes are clipped `<div>`s rather than SVG. SVG animation is rasterised
 *    on the main thread every frame, and it was the single most expensive thing
 *    on the page.
 *  * The tint is two plain gradients that cross-fade. It used to be one gradient
 *    with `filter: blur(40px)` whose colour stops were transitioned, which meant
 *    re-blurring the whole viewport on every frame for two seconds after each poll.
 *  * `Tint only` is the default (see `useAppearance`), so none of the above runs
 *    at all unless it is asked for.
 */
import { buildActivityVisual, polygonClipPath } from '#shared/utils/activityVisual';

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

/** Only three shapes exist, so their clip paths are built once for the session. */
const CLIP_PATHS: Record<number, string> = {
  3: polygonClipPath(3),
  4: polygonClipPath(4),
  6: polygonClipPath(6)
};

const { background } = useAppearance();
const prefersReducedMotion = usePrefersReducedMotion();

/** Reduced motion keeps the tint and drops the shapes, whatever the setting says. */
const mode = computed(() =>
  prefersReducedMotion.value && background.value === 'animated' ? 'static' : background.value
);

// Recomputed once per status poll, not per frame
const visual = computed(() => buildActivityVisual(props));

/** A faint base tint even when idle, brighter the busier that direction is. */
const upWash = computed(() => (0.05 + visual.value.upIntensity * 0.25).toFixed(3));
const downWash = computed(() => (0.05 + visual.value.downIntensity * 0.25).toFixed(3));
</script>

<style scoped>
.activity-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    /* Nothing in here can affect the rest of the page, so the browser is told not
       to look: a shape entering or leaving never costs a document-wide reflow */
    contain: layout paint style;
    /* Success and info from the Nuxt UI palette, with fallbacks */
    --activity-up: var(--ui-color-success-500, #22c55e);
    --activity-down: var(--ui-color-info-500, #3b82f6);
}

/*
 * The gradients are wide and soft enough to read as a glow on their own, so there
 * is no blur filter over the viewport any more. Opacity is the only thing that
 * moves, which the compositor handles without a repaint.
 */
.activity-bg__wash {
    position: absolute;
    inset: 0;
    transition: opacity 1.5s ease-out;
}

.activity-bg__wash--down {
    background: radial-gradient(120% 90% at 25% 0%, var(--activity-down) 0%, transparent 60%);
}

.activity-bg__wash--up {
    background: radial-gradient(120% 90% at 75% 100%, var(--activity-up) 0%, transparent 60%);
}

.activity-bg__shapes {
    position: absolute;
    inset: 0;
}

/*
 * Fades a shape that the transfer has just added or dropped. Opacity multiplies
 * down the tree, so this sits on top of the per-cycle fade below without either
 * one having to know about the other.
 */
.activity-bg__shape {
    position: absolute;
    top: 0;
    left: calc(var(--left) * 1%);
    /* vmin, so a shape stays a regular polygon whatever the window shape is */
    --dimension: calc(var(--size) * 1vmin);
    width: var(--dimension);
    height: var(--dimension);
    /* Centred on its column rather than starting at it */
    margin-left: calc(var(--dimension) / -2);
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
    width: 100%;
    height: 100%;
    /*
     * Drift and per-cycle fade share the duration and the delay, so the fade is
     * always in step with where the shape is.
     */
    animation-duration: var(--duration), var(--duration);
    animation-delay: var(--delay), var(--delay);
    animation-iteration-count: infinite, infinite;
    animation-timing-function: linear, ease-in-out;
    animation-fill-mode: both, both;
}

.activity-bg__drift--up {
    animation-name: activity-rise, activity-cycle;
}

.activity-bg__drift--down {
    animation-name: activity-fall, activity-cycle;
}

.activity-bg__spin {
    width: 100%;
    height: 100%;
    animation: activity-spin var(--spin) linear infinite;
}

/* The fill follows the rate, which moves in steps; crossfade so the step is not
   a visible flicker */
.activity-bg__polygon {
    width: 100%;
    height: 100%;
    transition: opacity 1.2s ease-out;
}

.activity-bg__polygon--up {
    background: var(--activity-up);
}

.activity-bg__polygon--down {
    background: var(--activity-down);
}

/*
 * The travel margin is the shape's own size rather than a fixed distance: a shape
 * is centred on its column, so a smaller margin left the biggest ones still half
 * on screen when the cycle restarted. A full size clears the rotated diagonal too.
 */
@keyframes activity-rise {
    from { transform: translate3d(0, calc(100vh + var(--dimension)), 0); }
    to { transform: translate3d(0, calc(var(--dimension) * -1), 0); }
}

@keyframes activity-fall {
    from { transform: translate3d(0, calc(var(--dimension) * -1), 0); }
    to { transform: translate3d(0, calc(100vh + var(--dimension)), 0); }
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
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
