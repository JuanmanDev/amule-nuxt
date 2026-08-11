<!--
  The bar that appears once rows are being selected.

  Fixed to the viewport rather than placed in the flow: the selection is made by
  scrolling through a long list, and an action bar further down that list is one
  you have to scroll a hundred rows to reach.

  Getting that to actually stick took two goes, both worth recording:

   * `position: sticky` pinned it to the bottom of the `<UCard>` it lives in,
     because the card's `overflow-hidden` (what rounds its corners) makes the
     card the sticky container.
   * `position: fixed` then pinned it 8,000 pixels down the page, because the
     app's frosted panels use `backdrop-filter`, and any ancestor with one
     becomes the containing block for fixed descendants.

  So it is teleported to `<body>`, where no ancestor of the list can reach it.

  It carries only what every list needs - how many are picked, select all, clear,
  leave - and takes the actions themselves as a slot, because those are the one
  thing that differs per list.
-->
<template>
  <Teleport to="body">
  <Transition name="selection-bar">
    <!-- Clear of the mobile navigation bar below lg, where it would otherwise
         cover the app's own bottom bar -->
    <div
      v-if="active"
      class="fixed inset-x-0 bottom-20 lg:bottom-4 z-30 px-4 sm:px-6 lg:px-8 pointer-events-none"
      data-testid="selection-bar"
    >
      <div class="mx-auto w-full max-w-(--ui-container) pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-elevated/95 backdrop-blur-sm p-2 shadow-lg">
        <UCheckbox
          :model-value="all ? true : (some ? 'indeterminate' : false)"
          :aria-label="$t('selection.selectAll')"
          @update:model-value="value => emit('toggleAll', value === true)"
        />

        <span class="text-sm font-medium whitespace-nowrap">
          {{ $t('selection.count', { count: count.toLocaleString(), total: total.toLocaleString() }) }}
        </span>

        <!-- The list's own actions. Disabled by the caller when nothing is picked. -->
        <div class="flex flex-wrap items-center gap-1 ms-auto">
          <slot />

          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="emit('stop')"
          >
            {{ $t('selection.done') }}
          </UButton>
        </div>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  active: boolean;
  count: number;
  /** How many rows could be selected, i.e. how many match the filter. */
  total: number;
  all: boolean;
  some: boolean;
}>();

const emit = defineEmits<{
  toggleAll: [selected: boolean];
  stop: [];
}>();
</script>

<style scoped>
/*
 * Slides up rather than fading: the bar covers the last row of the list, and a
 * fade in place looks like something appeared on top of what you were reading.
 */
.selection-bar-enter-active,
.selection-bar-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.selection-bar-enter-from,
.selection-bar-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .selection-bar-enter-active,
  .selection-bar-leave-active {
    transition: none;
  }
}
</style>
