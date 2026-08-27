<template>
  <UCard>
    <template #header>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="min-w-0">
          <slot name="title" :matched="matched" />
        </div>
        <ListControls
          v-model:search="filter"
          v-model:sort-by="sortBy"
          v-model:direction="direction"
          :options="sortOptions"
          :placeholder="$t('search.filterPlaceholder')"
          class="sm:max-w-md"
        />
      </div>

      <div class="flex flex-wrap items-center gap-1 mt-3">
        <UButton
          v-for="group in stateGroups"
          :key="group.value"
          :color="stateFilter === group.value ? 'primary' : 'neutral'"
          :variant="stateFilter === group.value ? 'soft' : 'ghost'"
          :disabled="group.count === 0 && group.value !== 'all'"
          size="xs"
          data-testid="result-group"
          :aria-pressed="stateFilter === group.value"
          @click="stateFilter = group.value"
        >
          {{ group.label }}
          <UBadge
            :color="stateFilter === group.value ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ group.count.toLocaleString() }}
          </UBadge>
        </UButton>
      </div>
    </template>

    <SmoothSwap>
      <UEmpty
        v-if="visibleResults.length === 0"
        key="no-matches"
        icon="i-heroicons-magnifying-glass"
        :title="$t('common.noMatches')"
        :description="filter
          ? $t('search.noMatchesDescription', { query: filter })
          : $t('search.noneInGroup')"
        :actions="stateFilter === 'all' ? [] : [{
          label: $t('search.filters.all'),
          color: 'neutral',
          variant: 'outline',
          onClick: () => { stateFilter = 'all' }
        }]"
      />

      <AnimatedList v-else key="rows" gap="0.75rem" :reset-key="listKey">
        <SearchResultRow
          v-for="result in visibleResults"
          :key="result.hash || `#${result.resultNumber}`"
          :result="result"
          :status="statusOf(result.hash)"
          :busy="downloadingHash === result.hash"
          @open="emit('open', $event)"
          @download="emit('download', $event)"
        />
      </AnimatedList>
    </SmoothSwap>

    <ListPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :page-count="pageCount"
      :matched="matched"
      :total="total"
      :first-on-page="firstOnPage"
      :last-on-page="lastOnPage"
      label="results"
      class="mt-4"
    />
  </UCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SearchResult } from '../../server/utils/amule-types';
import type { SortOption } from '#shared/utils/sorting';
import { fileKind } from '#shared/utils/fileKind';

const props = defineProps<{
  results: SearchResult[];
  storageKey: string;
  downloadingHash?: string | null;
  listId?: string;
}>();

const emit = defineEmits<{
  open: [result: SearchResult];
  download: [result: SearchResult];
}>();

const { t } = useI18n();
const { statusOf } = useFileStatus();

const sortOptions = computed<SortOption[]>(() => [
  { label: t('sort.sources'), value: 'sources', defaultDirection: 'desc' },
  { label: t('sort.size'), value: 'size', defaultDirection: 'desc' },
  { label: t('sort.kind'), value: 'kind', defaultDirection: 'asc' },
  { label: t('sort.name'), value: 'name', defaultDirection: 'asc' }
]);

const sortAccessors = {
  sources: (result: SearchResult) => result.sources,
  size: (result: SearchResult) => result.size,
  kind: (result: SearchResult) => fileKind(result.fileName),
  name: (result: SearchResult) => result.fileName
};

type ResultGroup = 'all' | 'new' | 'queued' | 'here';

function groupOf(result: SearchResult): Exclude<ResultGroup, 'all'> {
  const status = statusOf(result.hash);
  if (status.state === 'unknown') return 'new';
  return status.done ? 'here' : 'queued';
}

const stateFilter = ref<ResultGroup>('all');

const stateGroups = computed(() => {
  const counts = { new: 0, queued: 0, here: 0 };
  for (const result of props.results) counts[groupOf(result)] += 1;

  return [
    { value: 'all' as const, label: t('search.filters.all'), count: props.results.length },
    { value: 'new' as const, label: t('search.filters.new'), count: counts.new },
    { value: 'queued' as const, label: t('search.filters.queued'), count: counts.queued },
    { value: 'here' as const, label: t('search.filters.here'), count: counts.here }
  ];
});

const groupedResults = computed(() => (
  stateFilter.value === 'all'
    ? props.results
    : props.results.filter(result => groupOf(result) === stateFilter.value)
));

const {
  search: filter,
  sortBy,
  direction,
  page,
  pageSize,
  pageKey,
  visible: visibleResults,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<SearchResult>({
  items: groupedResults,
  fields: result => [result.fileName, result.hash, result.extension],
  accessors: sortAccessors,
  sortBy: 'sources',
  direction: 'desc',
  storageKey: props.storageKey
});

const listKey = computed(() => `${props.listId ?? 'default'}:${stateFilter.value}:${pageKey.value}`);

watch([() => props.listId, stateFilter], () => { page.value = 1; });
</script>
