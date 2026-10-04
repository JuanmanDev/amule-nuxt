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
        <div class="flex items-center gap-1">
          <UCheckbox
            :model-value="all ? true : ((allVisible || some) ? 'indeterminate' : false)"
            :aria-label="$t('selection.selectAll')"
            @update:model-value="onCheckboxToggle"
          />

          <UDropdownMenu :items="[selectMenuItems]" :modal="false">
            <UButton
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-heroicons-chevron-down"
              class="px-1"
              :aria-label="$t('selection.selectOptions')"
            />
          </UDropdownMenu>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm font-medium whitespace-nowrap">
            {{ $t('selection.count', { count: count.toLocaleString(), total: total.toLocaleString() }) }}
          </span>

          <!-- Quick prompt to select all matching filter when all visible are selected -->
          <UButton
            v-if="allVisible && !all && total > (visibleCount ?? 0)"
            variant="subtle"
            color="primary"
            size="xs"
            class="cursor-pointer font-medium"
            @click="onSelectAllMatching"
          >
            {{ $t('selection.selectAllMatchingPrompt', { total: total.toLocaleString() }) }}
          </UButton>

          <UBadge
            v-else-if="all && total > (visibleCount ?? total)"
            variant="subtle"
            color="primary"
            size="xs"
          >
            {{ $t('selection.allMatchingSelected', { total: total.toLocaleString() }) }}
          </UBadge>
        </div>

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
import { computed } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';

const props = defineProps<{
  active: boolean;
  count: number;
  /** How many rows could be selected, i.e. how many match the filter. */
  total: number;
  all: boolean;
  some: boolean;
  /** How many rows are currently visible on this page. */
  visibleCount?: number;
  allVisible?: boolean;
  someVisible?: boolean;
}>();

const emit = defineEmits<{
  toggleAll: [selected: boolean];
  toggleVisible: [selected: boolean];
  selectAllMatching: [];
  clear: [];
  stop: [];
}>();

const { t } = useI18n();

function onCheckboxToggle() {
  if (props.all) {
    emit('clear');
    emit('toggleAll', false);
  } else if (props.allVisible && props.total > (props.visibleCount ?? 0)) {
    onSelectAllMatching();
  } else {
    emit('toggleVisible', true);
  }
}

function onSelectAllMatching() {
  emit('selectAllMatching');
  emit('toggleAll', true);
}

const selectMenuItems = computed<DropdownMenuItem[]>(() => {
  const vCount = props.visibleCount ?? props.total;
  return [
    {
      label: t('selection.selectVisible', { count: vCount.toLocaleString() }),
      icon: 'i-heroicons-eye',
      disabled: vCount === 0,
      onSelect: () => emit('toggleVisible', true)
    },
    {
      label: t('selection.selectAllMatching', { count: props.total.toLocaleString() }),
      icon: 'i-heroicons-check-circle',
      disabled: props.total === 0,
      onSelect: onSelectAllMatching
    },
    {
      label: t('selection.clear'),
      icon: 'i-heroicons-x-mark',
      disabled: props.count === 0,
      onSelect: () => {
        emit('clear');
        emit('toggleAll', false);
      }
    }
  ];
});
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
