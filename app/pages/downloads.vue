<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">Downloads</h1>
        <p class="text-gray-600 dark:text-gray-400">Manage your download queue</p>
      </div>
      <div class="flex items-center gap-2">
        <UBadge v-if="wsStatus.connected" color="success" variant="subtle" size="lg">
          <template #leading>
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 animate-pulse" />
          </template>
          Live
        </UBadge>
        <UButton
          :loading="refreshing"
          :disabled="loading"
          icon="i-heroicons-arrow-path"
          variant="outline"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <AddLinkForm />

    <!-- Loading only before the first read of the session; the queue is cached
         app-wide afterwards, so a revisit renders it straight away -->
    <SmoothSwap>
      <div v-if="loading" key="loading" class="space-y-4">
        <div
          v-for="n in 3"
          :key="n"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg space-y-3"
        >
          <USkeleton class="h-5 w-2/3" />
          <USkeleton class="h-2 w-full" />
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <USkeleton v-for="c in 4" :key="c" class="h-8 w-full" />
          </div>
        </div>
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">Loading downloads...</p>
      </div>

      <!-- Only a hard error when there is nothing to show; with a queue in hand the
           failure is reported above it, so the page stays usable -->
      <UAlert
        v-else-if="error && items.length === 0"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        title="Failed to load downloads"
        :description="error"
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <UEmpty
        v-else-if="items.length === 0"
        key="empty"
        icon="i-heroicons-inbox"
        title="No downloads found"
        description="Paste an eD2k or magnet link above to start downloading."
      />

      <div v-else key="queue" class="space-y-6">
      <SmoothSwap>
        <UAlert
          v-if="error"
          color="warning"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
          title="Showing the last queue that could be read"
          :description="error"
          :actions="[{ label: 'Retry', color: 'warning', variant: 'outline', onClick: () => refresh() }]"
        />
      </SmoothSwap>
      <!-- Queue summary + filters -->
      <!-- Controls first, then the speed and the badges aligned right: on a phone
           the speed sits directly under the filter, on wider screens beside it -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <ListControls
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:direction="direction"
          :options="sortOptions"
          placeholder="Filter by name..."
          class="sm:flex-1 sm:max-w-md"
        />

        <div class="flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-400 w-full sm:w-auto sm:ms-auto">
          <!-- Always shown so the row does not jump when the rate drops to zero.
               Last on a phone, where it lines up with the right edge under the
               filter; first from sm up, where it sits closest to the filter. -->
          <NuxtLink
            to="/statistics"
            data-testid="queue-speed"
            class="order-last sm:order-first flex items-center gap-1 font-medium hover:underline"
            :class="totalSpeed > 0 ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'"
            title="Show the transfer rate over time"
          >
            <UIcon name="i-heroicons-arrow-down" class="w-4 h-4" />
            <AnimatedValue :model-value="formatSpeed(totalSpeed)" />
          </NuxtLink>
          <UBadge v-if="activeCount" color="success" variant="subtle">
            <AnimatedValue :model-value="activeCount" /> downloading
          </UBadge>
          <UBadge v-if="stalledCount" color="warning" variant="subtle">
            <AnimatedValue :model-value="stalledCount" /> without sources
          </UBadge>
          <UBadge color="neutral" variant="subtle">
            <AnimatedValue :model-value="items.length" /> in queue
          </UBadge>
        </div>
      </div>

      <SmoothSwap>
        <UEmpty
          v-if="visibleDownloads.length === 0"
          key="no-matches"
          icon="i-heroicons-magnifying-glass"
          title="No matches"
          :description="`No download matches '${search}'.`"
        />

        <!-- Rows fade in when a download is added and slide out when it is removed -->
        <TransitionGroup v-else key="rows" name="list" tag="div" class="space-y-4 relative">
          <DownloadRow
            v-for="download in visibleDownloads"
            :key="download.hash"
            :download="download"
            :busy="busyHash === download.hash"
            @open="openDetails"
            @remove="askRemove"
            @pause="pause"
            @resume="resume"
            @priority="setPriority"
          />
        </TransitionGroup>
      </SmoothSwap>
      </div>
    </SmoothSwap>

    <DownloadDetailsModal
      v-model="detailsOpen"
      :download="selected"
      @remove="askRemove"
    />

    <!-- Removing deletes the partfile, so confirm first -->
    <UModal v-model:open="removeOpen" title="Remove download">
      <template #body>
        <p class="text-sm">
          Remove <span class="font-semibold break-all">{{ pendingRemove?.name }}</span> from the queue?
          aMule deletes the data downloaded so far.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { removeOpen = false }">Keep it</UButton>
          <UButton color="error" :loading="busyHash === pendingRemove?.hash" @click="confirmRemove">
            Remove
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Download } from '../../server/utils/amule-types';
import { classifyDownload } from '#shared/utils/downloadHealth';
import { formatSpeed } from '#shared/utils/format';
import { filterItems, sortItems, type SortDirection, type SortOption } from '#shared/utils/sorting';

useHead({ title: 'Downloads' });

const {
  items,
  loading,
  error,
  busyHash,
  wsStatus,
  activeCount,
  stalledCount,
  totalSpeed,
  fetchDownloads,
  startPolling,
  pause,
  resume,
  remove,
  setPriority
} = useDownloads();

startPolling();

const refreshing = ref(false);
const search = ref('');
const sortBy = ref('progress');
const direction = ref<SortDirection>('desc');
const detailsOpen = ref(false);
const removeOpen = ref(false);
const selected = ref<Download | null>(null);
const pendingRemove = ref<Download | null>(null);

const sortOptions: SortOption[] = [
  { label: 'Progress', value: 'progress', defaultDirection: 'desc' },
  { label: 'Speed', value: 'speed', defaultDirection: 'desc' },
  { label: 'Size', value: 'size', defaultDirection: 'desc' },
  { label: 'Sources', value: 'sources', defaultDirection: 'desc' },
  { label: 'Name', value: 'name', defaultDirection: 'asc' },
  { label: 'Status', value: 'status', defaultDirection: 'asc' }
];

/** One accessor per sort option, shared shape across every list page. */
const sortAccessors = {
  progress: (download: Download) => download.percentComplete,
  speed: (download: Download) => download.speed,
  size: (download: Download) => download.size,
  sources: (download: Download) => download.sources,
  name: (download: Download) => download.name,
  status: (download: Download) => classifyDownload(download).label
};

const visibleDownloads = computed(() => sortItems(
  filterItems(items.value, search.value, download => [download.name, download.hash]),
  sortBy.value,
  direction.value,
  sortAccessors
));

// Keep the open modal in sync with polled data
watch(items, list => {
  if (!selected.value) return;
  const fresh = list.find(download => download.hash === selected.value?.hash);
  selected.value = fresh ?? null;
  if (!fresh) detailsOpen.value = false;
});

function openDetails(download: Download) {
  selected.value = download;
  detailsOpen.value = true;
}

function askRemove(download: Download) {
  pendingRemove.value = download;
  removeOpen.value = true;
}

async function confirmRemove() {
  const download = pendingRemove.value;
  if (!download) return;

  const removed = await remove(download);
  removeOpen.value = false;
  pendingRemove.value = null;

  if (removed && selected.value?.hash === download.hash) {
    detailsOpen.value = false;
    selected.value = null;
  }
}

async function refresh() {
  refreshing.value = true;
  await fetchDownloads({ silent: true });
  refreshing.value = false;
}
</script>
