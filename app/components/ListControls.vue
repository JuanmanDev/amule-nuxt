<template>
  <!-- One row on every screen size: the search grows, sort and direction stay compact -->
  <div class="flex items-center gap-2 w-full">
    <UInput
      :model-value="search"
      :placeholder="placeholder || $t('common.filter')"
      icon="i-heroicons-magnifying-glass"
      class="flex-1 min-w-0"
      :ui="{ trailing: 'pe-1' }"
      @update:model-value="value => emit('update:search', String(value))"
    >
      <template v-if="search" #trailing>
        <UButton
          icon="i-heroicons-x-mark"
          variant="link"
          color="neutral"
          size="xs"
          :aria-label="$t('common.clearFilter')"
          @click="emit('update:search', '')"
        />
      </template>
    </UInput>

    <!-- Sort field: icon only on small screens, icon plus label from sm up -->
    <UDropdownMenu :items="[sortItems]" :modal="false">
      <UButton
        icon="i-heroicons-bars-arrow-down"
        color="neutral"
        variant="outline"
        class="shrink-0"
        :aria-label="$t('common.sortBy', { field: activeOption?.label ?? sortBy })"
      >
        <span class="hidden sm:inline">{{ activeOption?.label ?? sortBy }}</span>
      </UButton>
    </UDropdownMenu>

    <!-- Every option can be ordered both ways -->
    <UButton
      :icon="direction === 'asc' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'"
      color="neutral"
      variant="outline"
      class="shrink-0"
      :aria-label="direction === 'asc' ? $t('common.ascending') : $t('common.descending')"
      :title="direction === 'asc' ? $t('common.ascendingShort') : $t('common.descendingShort')"
      @click="toggleDirection"
    />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { SortDirection, SortOption } from '#shared/utils/sorting';

const props = withDefaults(defineProps<{
  search: string;
  sortBy: string;
  direction: SortDirection;
  options: SortOption[];
  placeholder?: string;
}>(), {
  placeholder: ''
});

const emit = defineEmits<{
  'update:search': [value: string];
  'update:sortBy': [value: string];
  'update:direction': [value: SortDirection];
}>();

const activeOption = computed(() => props.options.find(option => option.value === props.sortBy));

const sortItems = computed<DropdownMenuItem[]>(() => props.options.map(option => ({
  label: option.label,
  icon: option.value === props.sortBy ? 'i-heroicons-check' : undefined,
  onSelect: () => selectSort(option)
})));

/** Picking a field applies its natural direction, which the user can then flip. */
function selectSort(option: SortOption) {
  emit('update:sortBy', option.value);
  if (option.defaultDirection && option.value !== props.sortBy) {
    emit('update:direction', option.defaultDirection);
  }
}

function toggleDirection() {
  emit('update:direction', props.direction === 'asc' ? 'desc' : 'asc');
}
</script>
