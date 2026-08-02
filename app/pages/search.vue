<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-3xl font-bold mb-1">Search</h1>
      <p class="text-gray-600 dark:text-gray-400">Search for files on the eD2k and Kad networks</p>
    </div>

    <!-- Search Form -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">New search</h2>
      </template>

      <UForm :state="form" @submit="handleSearch" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UFormField label="Network" name="type">
            <USelect
              v-model="form.type"
              :items="searchTypes"
              value-key="value"
              label-key="label"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Keywords" name="keyword" class="md:col-span-2">
            <UInput
              v-model="form.keyword"
              placeholder="Enter search keywords..."
              size="lg"
              class="w-full"
              @keydown.enter.prevent="handleSearch"
            />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            type="submit"
            size="lg"
            :loading="starting"
            :disabled="!form.keyword.trim() || searching"
            icon="i-heroicons-magnifying-glass"
          >
            Search
          </UButton>

          <UButton
            v-if="searching"
            size="lg"
            color="neutral"
            variant="outline"
            icon="i-heroicons-stop"
            @click="stopSearch"
          >
            Stop
          </UButton>

          <UButton
            v-else-if="hasSearched"
            size="lg"
            variant="outline"
            :loading="fetching"
            icon="i-heroicons-arrow-path"
            @click="fetchResults"
          >
            Refresh results
          </UButton>
        </div>
      </UForm>
    </UCard>

    <!-- Live progress while the network answers -->
    <SmoothSwap>
    <UCard v-if="searching">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
            Searching {{ form.type }} for "{{ lastKeyword }}"...
          </span>
          <span class="text-gray-500 dark:text-gray-400">
            <AnimatedValue :model-value="results.length" /> results so far
          </span>
        </div>
        <UProgress animation="carousel" />
      </div>
    </UCard>
    </SmoothSwap>

    <!-- Results -->
    <SmoothSwap>
    <UCard v-if="results.length > 0" key="results">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">Results ({{ results.length }})</h2>
          <ListControls
            v-model:search="filter"
            v-model:sort-by="sortBy"
            v-model:direction="direction"
            :options="sortOptions"
            placeholder="Filter results..."
            class="sm:max-w-md"
          />
        </div>
      </template>

      <SmoothSwap>
      <UEmpty
        v-if="visibleResults.length === 0"
        key="no-matches"
        icon="i-heroicons-magnifying-glass"
        title="No matches"
        :description="`No result matches '${filter}'.`"
      />

      <TransitionGroup v-else key="rows" name="list" tag="div" class="space-y-3 relative">
        <div
          v-for="result in visibleResults"
          :key="result.hash || result.resultNumber"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate" :title="result.fileName">{{ result.fileName }}</h3>
              <div class="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span class="flex items-center gap-1">
                  <UIcon name="i-heroicons-document" class="w-4 h-4" />
                  {{ formatBytes(result.size) }}
                </span>
                <span class="flex items-center gap-1">
                  <UIcon name="i-heroicons-user-group" class="w-4 h-4" />
                  {{ result.sources }} sources
                </span>
              </div>
            </div>

            <UButton
              :loading="downloading === result.hash"
              :disabled="!result.hash"
              size="sm"
              icon="i-heroicons-arrow-down-tray"
              class="shrink-0"
              @click="handleDownload(result)"
            >
              Download
            </UButton>
          </div>
        </div>
      </TransitionGroup>
      </SmoothSwap>
    </UCard>

    <UEmpty
      v-else-if="hasSearched && !searching"
      key="no-results"
      icon="i-heroicons-magnifying-glass"
      title="No results found"
      description="Try different keywords, or search another network."
    />
    </SmoothSwap>
  </div>
</template>

<script setup lang="ts">
import type { SearchResult } from '../../server/utils/amule-types';
import { formatBytes } from '#shared/utils/format';
import { filterItems, sortItems, type SortDirection, type SortOption } from '#shared/utils/sorting';

const api = useAmuleApi();
const toast = useToast();

useHead({ title: 'Search' });

const searchTypes = [
  { label: 'Kad network', value: 'Kad' },
  { label: 'Global (eD2k)', value: 'Global' },
  { label: 'Local (connected server)', value: 'Local' }
];

const form = reactive({
  type: 'Kad' as 'Global' | 'Kad' | 'Local',
  keyword: ''
});

const starting = ref(false);
const fetching = ref(false);
/** True while results are still arriving from the network. */
const searching = ref(false);
const hasSearched = ref(false);
const lastKeyword = ref('');
const results = ref<SearchResult[]>([]);
const filter = ref('');
const sortBy = ref('sources');
const direction = ref<SortDirection>('desc');
const downloading = ref<string | null>(null);

const sortOptions: SortOption[] = [
  { label: 'Sources', value: 'sources', defaultDirection: 'desc' },
  { label: 'Size', value: 'size', defaultDirection: 'desc' },
  { label: 'Name', value: 'name', defaultDirection: 'asc' }
];

const sortAccessors = {
  sources: (result: SearchResult) => result.sources,
  size: (result: SearchResult) => result.size,
  name: (result: SearchResult) => result.fileName
};

/**
 * aMule keeps collecting results after the search request returns, and for a Kad
 * search its progress value stays 0 until the very end. So poll the results and
 * stop once their number no longer grows.
 */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 20;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const visibleResults = computed(() => sortItems(
  filterItems(results.value, filter.value, result => [result.fileName, result.hash]),
  sortBy.value,
  direction.value,
  sortAccessors
));

async function fetchResults() {
  fetching.value = true;
  try {
    const result = await api.getSearchResults();
    if (result.success) {
      results.value = result.data?.results ?? [];
    } else {
      toast.add({ title: 'Failed to get results', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    fetching.value = false;
  }
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
  searching.value = false;
}

function pollResults(attempt = 0, previousCount = -1) {
  pollTimer = setTimeout(async () => {
    await fetchResults();

    const settled = results.value.length > 0 && results.value.length === previousCount;
    if (settled || attempt + 1 >= MAX_POLLS) {
      stopPolling();
      if (results.value.length > 0) {
        toast.add({ title: `Found ${results.value.length} results`, color: 'success' });
      }
      return;
    }

    pollResults(attempt + 1, results.value.length);
  }, POLL_INTERVAL_MS);
}

async function handleSearch() {
  if (!form.keyword.trim()) {
    toast.add({ title: 'Please enter search keywords', color: 'warning' });
    return;
  }

  stopPolling();
  starting.value = true;
  results.value = [];

  try {
    const result = await api.search(form.type, form.keyword);
    if (result.success) {
      hasSearched.value = true;
      lastKeyword.value = form.keyword.trim();
      searching.value = true;
      toast.add({ title: result.message || 'Search started', color: 'info' });
      pollResults();
    } else {
      toast.add({ title: 'Search failed', description: result.error || result.message, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    starting.value = false;
  }
}

async function stopSearch() {
  stopPolling();
  try {
    const result = await api.stopSearch();
    toast.add({
      title: result.success ? (result.message || 'Search stopped') : 'Could not stop search',
      color: result.success ? 'warning' : 'error'
    });
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  }
  await fetchResults();
}

async function handleDownload(result: SearchResult) {
  if (!result.hash) {
    toast.add({ title: 'Cannot download', description: 'aMule reported no hash for this result.', color: 'error' });
    return;
  }

  downloading.value = result.hash;
  try {
    const response = await api.downloadFromSearch(result.hash);
    if (response.success) {
      toast.add({ title: response.message || 'Download started', color: 'success' });
    } else {
      toast.add({ title: 'Failed to start download', description: response.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    downloading.value = null;
  }
}

onUnmounted(stopPolling);
</script>
