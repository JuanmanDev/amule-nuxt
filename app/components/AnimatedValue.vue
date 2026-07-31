<template>
  <!-- Crossfades and briefly highlights whenever the value changes, so live
       updates are noticeable without the text jumping -->
  <span class="inline-flex relative overflow-hidden align-bottom">
    <Transition name="value" mode="out-in">
      <span :key="String(modelValue)" :class="flashing ? 'value-flash px-0.5' : ''">
        <slot :value="modelValue">{{ modelValue }}</slot>
      </span>
    </Transition>
  </span>
</template>

<script setup lang="ts">
/**
 * Wraps a live figure (speed, count, status label) so a change is animated.
 * Keeping it in one component means every page animates changes the same way.
 */
const props = withDefaults(defineProps<{
  modelValue: string | number | null | undefined;
  /** Highlight briefly in addition to the crossfade. */
  flash?: boolean;
}>(), {
  flash: true
});

const flashing = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(() => props.modelValue, (next, previous) => {
  // No highlight on the first render, only on real changes
  if (!props.flash || next === previous || previous === undefined) return;

  flashing.value = false;
  if (timer) clearTimeout(timer);

  // Restart the animation on the next tick so consecutive changes both flash
  nextTick(() => {
    flashing.value = true;
    timer = setTimeout(() => {
      flashing.value = false;
    }, 900);
  });
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>
