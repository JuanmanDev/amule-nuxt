<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">Shared files</h1>
        <p class="text-gray-600 dark:text-gray-400">Everything this daemon offers, with request and transfer details</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton to="/uploads" variant="link" trailing-icon="i-heroicons-arrow-right" size="sm">
          Active uploads
        </UButton>
        <UButton
          :loading="refreshing"
          :disabled="loading"
          variant="outline"
          icon="i-heroicons-arrow-path"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Loading only before the first read of the session: the cached list is
         rendered straight away on every later visit -->
    <SmoothSwap>
      <div v-if="loading" key="loading" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
        </div>
        <USkeleton v-for="n in 5" :key="`row-${n}`" class="h-14 w-full" />
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">Loading shared files...</p>
      </div>

      <UAlert
        v-else-if="error && files.length === 0"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        title="Failed to load shared files"
        :description="error"
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <div v-else key="content" class="space-y-6">
        <SmoothSwap>
          <UAlert
            v-if="error"
            color="warning"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            title="Showing the last list that could be read"
            :description="error"
            :actions="[{ label: 'Retry', color: 'warning', variant: 'outline', onClick: () => refresh() }]"
          />
        </SmoothSwap>

      <!-- Totals -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Files shared</div>
          <div class="text-2xl font-bold mt-1">{{ files.length.toLocaleString() }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Total size</div>
          <div class="text-2xl font-bold mt-1">{{ formatBytes(totals.size) }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Uploaded all time</div>
          <div class="text-2xl font-bold mt-1 text-green-600">{{ formatBytes(totals.transferred) }}</div>
          <!-- Per-file counters live with the files and survive a statistics
               reset, so this total is usually above the daemon's own counter -->
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Sum of the per-file counters
          </div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Requests all time</div>
          <div class="text-2xl font-bold mt-1">{{ totals.requests.toLocaleString() }}</div>
        </div>
      </div>

      <SmoothSwap>
      <UEmpty
        v-if="files.length === 0"
        key="empty"
        icon="i-heroicons-document-text"
        title="No shared files"
        description="aMule reports no files in your shared directories."
      />

      <UCard v-else key="list">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">Files ({{ visibleFiles.length }})</h2>
            <ListControls
              v-model:search="search"
              v-model:sort-by="sortBy"
              v-model:direction="direction"
              :options="sortOptions"
              placeholder="Filter files..."
              class="sm:max-w-md"
            />
          </div>
        </template>

        <SmoothSwap>
        <UEmpty
          v-if="visibleFiles.length === 0"
          key="no-matches"
          icon="i-heroicons-magnifying-glass"
          title="No matches"
          :description="`No shared file matches '${search}'.`"
        />

        <TransitionGroup v-else key="rows" name="list" tag="div" class="space-y-2 relative">
          <div
            v-for="file in visibleFiles"
            :key="file.hash || file.fileName"
            class="p-3 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            role="button"
            tabindex="0"
            :aria-label="`Show details for ${file.fileName}`"
            @click="openDetails(file)"
            @keydown.enter.prevent="openDetails(file)"
            @keydown.space.prevent="openDetails(file)"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-start justify-between gap-2">
                <p class="font-medium truncate" :title="file.fileName">{{ file.fileName }}</p>
                <UBadge variant="subtle" size="sm" class="shrink-0" :color="file.onQueue > 0 ? 'info' : 'neutral'">
                  {{ file.onQueue > 0 ? `${file.onQueue} queued` : formatBytes(file.size) }}
                </UBadge>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs text-gray-600 dark:text-gray-400">
                <span>Size: <span class="font-medium">{{ formatBytes(file.size) }}</span></span>
                <span>Sent: <span class="font-medium">{{ formatBytes(file.transferredAll) }}</span></span>
                <span>Requests: <span class="font-medium">{{ file.requestsAll.toLocaleString() }}</span></span>
                <span>Accepted: <span class="font-medium">{{ file.acceptsAll.toLocaleString() }}</span></span>
                <span>Ratio: <span class="font-medium">{{ file.shareRatio.toFixed(2) }}x</span></span>
              </div>
            </div>
          </div>
        </TransitionGroup>
        </SmoothSwap>
      </UCard>
      </SmoothSwap>
      </div>
    </SmoothSwap>

    <!-- Details -->
    <UModal v-model:open="detailsOpen" :ui="{ content: 'max-w-3xl' }" title="Shared file details">
      <template #body>
        <div v-if="selected" class="space-y-6">
          <div class="space-y-2">
            <p class="text-sm font-semibold break-all leading-snug">{{ selected.fileName }}</p>
            <p v-if="selected.fullPath" class="text-xs text-gray-500 dark:text-gray-400 break-all">
              {{ selected.fullPath }}
            </p>
          </div>

          <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div v-for="fact in facts" :key="fact.label" class="min-w-0">
              <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
              <dd class="font-medium break-words">{{ fact.value }}</dd>
            </div>
          </dl>

          <div v-if="selected.comment">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Comment</div>
            <p class="text-sm break-words">{{ selected.comment }}</p>
          </div>

          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">File hash</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ selected.hash || 'unknown' }}</code>
              <UButton
                v-if="selected.hash"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                aria-label="Copy hash"
                @click="copy(selected.hash, 'Hash copied')"
              />
            </div>
          </div>

          <div v-if="selected.ed2kLink">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">eD2k link</div>
            <div class="flex items-start gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ selected.ed2kLink }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                aria-label="Copy ed2k link"
                @click="copy(selected.ed2kLink, 'ed2k link copied')"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="() => { detailsOpen = false }">Close</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { SharedFile } from '../../server/utils/amule-types';
import { formatBytes } from '#shared/utils/format';
import { filterItems, sortItems, type SortDirection, type SortOption } from '#shared/utils/sorting';

const toast = useToast();

useHead({ title: 'Shared files' });

// Shared, prefetched feed: refreshed once a minute in the background, faster
// while this page is open, and never re-fetched from scratch on a revisit.
const feed = useSharedFilesFeed();
const { items: files, loading, error } = feed;
feed.focus();

const refreshing = ref(false);
const search = ref('');
const sortBy = ref('transferred');
const direction = ref<SortDirection>('desc');
const detailsOpen = ref(false);
const selected = ref<SharedFile | null>(null);

const sortOptions: SortOption[] = [
  { label: 'Uploaded', value: 'transferred', defaultDirection: 'desc' },
  { label: 'Requests', value: 'requests', defaultDirection: 'desc' },
  { label: 'Size', value: 'size', defaultDirection: 'desc' },
  { label: 'Share ratio', value: 'ratio', defaultDirection: 'desc' },
  { label: 'Queued clients', value: 'queue', defaultDirection: 'desc' },
  { label: 'Name', value: 'name', defaultDirection: 'asc' }
];

const sortAccessors = {
  transferred: (file: SharedFile) => file.transferredAll,
  requests: (file: SharedFile) => file.requestsAll,
  size: (file: SharedFile) => file.size,
  ratio: (file: SharedFile) => file.shareRatio,
  queue: (file: SharedFile) => file.onQueue,
  name: (file: SharedFile) => file.fileName
};

const totals = computed(() => files.value.reduce(
  (sum, file) => ({
    size: sum.size + file.size,
    transferred: sum.transferred + file.transferredAll,
    requests: sum.requests + file.requestsAll
  }),
  { size: 0, transferred: 0, requests: 0 }
));

const visibleFiles = computed(() => sortItems(
  filterItems(files.value, search.value, file => [file.fileName, file.hash, file.fullPath]),
  sortBy.value,
  direction.value,
  sortAccessors
));

const facts = computed(() => {
  const file = selected.value;
  if (!file) return [];

  return [
    { label: 'Size', value: formatBytes(file.size) },
    { label: 'Uploaded (all time)', value: formatBytes(file.transferredAll) },
    { label: 'Uploaded (session)', value: formatBytes(file.transferred) },
    { label: 'Share ratio', value: `${file.shareRatio.toFixed(2)}x` },
    { label: 'Requests (all time)', value: file.requestsAll.toLocaleString() },
    { label: 'Requests (session)', value: file.requests.toLocaleString() },
    { label: 'Accepted (all time)', value: file.acceptsAll.toLocaleString() },
    { label: 'Accepted (session)', value: file.accepts.toLocaleString() },
    { label: 'Clients queued', value: file.onQueue.toLocaleString() },
    { label: 'Complete sources', value: file.completeSources.toLocaleString() },
    { label: 'Upload priority', value: `${file.priority}${file.autoPriority ? ' (auto)' : ''}` }
  ];
});

async function refresh() {
  refreshing.value = true;
  await feed.refresh({ force: true });
  refreshing.value = false;
}

function openDetails(file: SharedFile) {
  selected.value = file;
  detailsOpen.value = true;
}

async function copy(value: string, successTitle: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: successTitle, color: 'success' });
  } catch {
    toast.add({ title: 'Could not copy to clipboard', description: value, color: 'warning' });
  }
}

</script>
