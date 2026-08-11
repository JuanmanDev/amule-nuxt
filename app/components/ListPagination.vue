<!--
  The bar under a long list: what you are looking at, how much of it there is,
  how many rows to show at a time, and the pages themselves.

  It renders nothing while the whole list fits on one page and the default page
  size has not been changed, so short lists (an empty queue, three uploads) look
  exactly as they did before.
-->
<template>
  <div
    v-if="visible"
    class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1"
    data-testid="list-pagination"
  >
    <p class="text-sm text-gray-600 dark:text-gray-400 order-last sm:order-first">
      <template v-if="matched === 0">
        {{ $t('pagination.empty', { label: localisedLabel }) }}
      </template>
      <template v-else>
        <i18n-t keypath="pagination.showing" scope="global">
          <template #from><span class="font-medium text-gray-900 dark:text-gray-100">{{ formatCount(firstOnPage) }}</span></template>
          <template #to><span class="font-medium text-gray-900 dark:text-gray-100">{{ formatCount(lastOnPage) }}</span></template>
          <template #count>{{ formatCount(matched) }}</template>
          <template #label>{{ localisedLabel }}</template>
        </i18n-t>
        <span v-if="matched !== total">{{ $t('pagination.filteredFrom', { total: formatCount(total) }) }}</span>
      </template>
    </p>

    <div class="flex items-center gap-3 justify-between sm:justify-end">
      <div class="flex items-center gap-2 shrink-0">
        <label :for="selectId" class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ $t('pagination.perPage') }}</label>
        <USelect
          :id="selectId"
          :model-value="pageSize"
          :items="pageSizeItems"
          value-key="value"
          label-key="label"
          size="sm"
          class="w-24"
          @update:model-value="value => emit('update:pageSize', Number(value))"
        />
      </div>

      <UPagination
        v-if="pageCount > 1"
        :page="page"
        :total="matched"
        :items-per-page="pageSize"
        :sibling-count="1"
        size="sm"
        @update:page="value => emit('update:page', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ALL_ITEMS, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../composables/usePaginatedList';

const props = defineProps<{
  page: number;
  pageSize: number;
  pageCount: number;
  /** Rows matching the filter, i.e. what the pages are cut from. */
  matched: number;
  /** Rows in the list before filtering. */
  total: number;
  firstOnPage: number;
  lastOnPage: number;
  /** Key under `pagination.labels`: "downloads", "files", "results"... */
  label: 'downloads' | 'transfers' | 'files' | 'results' | 'servers' | 'lines';
}>();

const emit = defineEmits<{
  'update:page': [value: number];
  'update:pageSize': [value: number];
}>();

// The label needs an id to point at and there can be several bars on a page
const selectId = useId();

/**
 * Hidden while there is nothing to decide: one page of a list shorter than the
 * default, and a size the user never touched.
 */
const visible = computed(() =>
  props.pageCount > 1 || props.matched > DEFAULT_PAGE_SIZE || props.pageSize !== DEFAULT_PAGE_SIZE
);

const { t, locale } = useI18n();

/** The plural noun for the rows, translated: "downloads", "results", "files". */
const localisedLabel = computed(() => t(`pagination.labels.${props.label}`));

const pageSizeItems = computed(() => PAGE_SIZE_OPTIONS.map(size => ({
  label: size === ALL_ITEMS ? t('pagination.all') : String(size),
  value: size
})));

/** Thousands separators, because "3482" and "34825" read the same at a glance. */
function formatCount(value: number): string {
  // Grouped the way the chosen language groups them: 1,234 in English,
  // 1.234 in German, 1 234 in French
  return value.toLocaleString(locale.value);
}
</script>
