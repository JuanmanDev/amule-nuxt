<template>
  <!-- Crossfades and briefly highlights whenever the value changes, so live
       updates are noticeable without the text jumping -->
  <span class="inline-flex relative overflow-hidden align-bottom">
    <!-- No `mode`: the old and the new value are on screen together and cross
         over each other. `out-in` waited for the old one to leave first, which
         left a gap with no number in it at all. -->
    <Transition name="value">
      <span :key="String(displayed)" :class="flashing ? 'value-flash px-0.5' : ''">
        <slot :value="displayed">{{ displayed }}</slot>
      </span>
    </Transition>
  </span>
</template>

<script setup lang="ts">
/**
 * Wraps a live figure (speed, count, status label) so a change is animated.
 * Keeping it in one component means every page animates changes the same way.
 *
 * The figure behind it is polled every second or two. Showing every one of those
 * meant a permanent flicker, so what is displayed changes at most once per
 * `interval`: the first change goes through straight away, later ones are held
 * and the newest of them is shown when the interval is up.
 */
type Value = string | number | null | undefined;

const props = withDefaults(defineProps<{
  modelValue: Value;
  /** Highlight briefly in addition to the crossfade. */
  flash?: boolean;
  /**
   * Shortest gap between two displayed values, in milliseconds. 0 shows every
   * change as it arrives.
   */
  interval?: number;
}>(), {
  flash: true,
  interval: 10_000
});

/** What is on screen, which trails props.modelValue by up to `interval`. */
const displayed = ref<Value>(props.modelValue);
const flashing = ref(false);

let flashTimer: ReturnType<typeof setTimeout> | undefined;
let cooldown: ReturnType<typeof setTimeout> | undefined;
/** Newest value that arrived during the cooldown, if it differs from the shown one. */
let pending: Value;
let hasPending = false;

function flash() {
  if (!props.flash) return;

  flashing.value = false;
  if (flashTimer) clearTimeout(flashTimer);

  // Restart the animation on the next tick so consecutive changes both flash
  nextTick(() => {
    flashing.value = true;
    flashTimer = setTimeout(() => {
      flashing.value = false;
    }, 900);
  });
}

function show(next: Value) {
  if (next === displayed.value) return;
  displayed.value = next;
  flash();
}

/**
 * Runs while values keep arriving and stops once one interval passes with
 * nothing new, so an idle figure is not held back when it finally moves.
 */
function startCooldown() {
  cooldown = setTimeout(() => {
    cooldown = undefined;
    if (!hasPending) return;

    const next = pending;
    hasPending = false;
    pending = undefined;
    show(next);
    startCooldown();
  }, props.interval);
}

watch(() => props.modelValue, next => {
  if (props.interval <= 0) {
    show(next);
    return;
  }

  if (cooldown) {
    pending = next;
    // A value that wanders back to what is already shown needs no update
    hasPending = next !== displayed.value;
    return;
  }

  show(next);
  startCooldown();
});

onUnmounted(() => {
  if (flashTimer) clearTimeout(flashTimer);
  if (cooldown) clearTimeout(cooldown);
});
</script>
