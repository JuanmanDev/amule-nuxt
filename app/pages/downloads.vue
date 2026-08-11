<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('downloads.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('downloads.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <UBadge v-if="wsStatus.connected" color="success" variant="subtle" size="lg">
          <template #leading>
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 animate-pulse" />
          </template>
          {{ $t('common.live') }}
        </UBadge>
        <UButton
          :loading="refreshing"
          :disabled="loading"
          icon="i-heroicons-arrow-path"
          variant="outline"
          @click="refresh"
        >
          {{ $t('common.refresh') }}
        </UButton>
      </div>
    </div>

    <!-- Multiline, like the dashboard and the add page: this was the one add field
         left on a single line, where a pasted batch loses its newlines -->
    <AddLinkForm multiline />

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
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">{{ $t('downloads.loading') }}</p>
      </div>

      <!-- Only a hard error when there is nothing to show; with a queue in hand the
           failure is reported above it, so the page stays usable -->
      <UAlert
        v-else-if="error && items.length === 0"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="$t('downloads.loadFailed')"
        :description="error"
        :actions="[{ label: $t('common.retry'), color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <UEmpty
        v-else-if="items.length === 0"
        key="empty"
        icon="i-heroicons-inbox"
        :title="$t('downloads.emptyTitle')"
        :description="$t('downloads.emptyDescription')"
      />

      <div v-else key="queue" class="space-y-6">
      <SmoothSwap>
        <UAlert
          v-if="error"
          color="warning"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
          :title="$t('downloads.staleTitle')"
          :description="error"
          :actions="[{ label: $t('common.retry'), color: 'warning', variant: 'outline', onClick: () => refresh() }]"
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
          :placeholder="$t('downloads.filterPlaceholder')"
          class="sm:flex-1 sm:max-w-md"
        />

        <!-- Off by default: a list of checkboxes makes the ordinary case of
             reading a row worse -->
        <UButton
          v-if="!selection.active.value"
          icon="i-heroicons-check-circle"
          color="neutral"
          variant="outline"
          class="shrink-0"
          @click="selection.start"
        >
          <span class="hidden sm:inline">{{ $t('selection.select') }}</span>
        </UButton>

        <div class="flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-400 w-full sm:w-auto sm:ms-auto">
          <!-- Always shown so the row does not jump when the rate drops to zero.
               Last on a phone, where it lines up with the right edge under the
               filter; first from sm up, where it sits closest to the filter. -->
          <NuxtLink
            to="/statistics"
            data-testid="queue-speed"
            class="order-last sm:order-first flex items-center gap-1 font-medium hover:underline"
            :class="totalSpeed > 0 ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'"
            :title="$t('downloads.showRateOverTime')"
          >
            <UIcon name="i-heroicons-arrow-down" class="w-4 h-4" />
            <AnimatedValue :model-value="formatSpeed(totalSpeed)" />
          </NuxtLink>
          <UBadge v-if="activeCount" color="success" variant="subtle">
            <AnimatedValue :model-value="activeCount" /> {{ $t('downloads.downloading') }}
          </UBadge>
          <!-- Info, not a warning: a download with no source yet is normally just
               being looked up -->
          <UBadge v-if="searchingCount" color="info" variant="subtle">
            <AnimatedValue :model-value="searchingCount" /> {{ $t('downloads.searchingForSources') }}
          </UBadge>
          <UBadge color="neutral" variant="subtle">
            <AnimatedValue :model-value="items.length" /> {{ $t('downloads.inQueue') }}
          </UBadge>
        </div>
      </div>

      <SmoothSwap>
        <UEmpty
          v-if="visibleDownloads.length === 0"
          key="no-matches"
          icon="i-heroicons-magnifying-glass"
          :title="$t('common.noMatches')"
          :description="$t('downloads.noMatchesDescription', { query: search })"
        />

        <!-- An added download pushes the queue open, a removed one closes the gap
             behind it, and a re-sort glides the rows to their new place. Turning
             a page replaces every row at once, which `reset-key` keeps silent. -->
        <AnimatedList v-else key="rows" gap="1rem" :reset-key="pageKey">
          <DownloadRow
            v-for="download in visibleDownloads"
            :key="download.hash"
            :download="download"
            :busy="busyHash === download.hash"
            :selectable="selection.active.value"
            :selected="selection.has(download.hash)"
            @open="openDetails"
            @remove="askRemove"
            @pause="pause"
            @resume="resume"
            @priority="setPriority"
            @select="(download, on) => selection.toggle(download.hash, on)"
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
        label="downloads"
      />

      <!-- "All" means every download matching the filter, not every one on this
           page: which page happens to be open must not change what Remove does -->
      <SelectionBar
        :active="selection.active.value"
        :count="selection.count.value"
        :total="matched"
        :all="selection.all.value"
        :some="selection.some.value"
        @toggle-all="on => selection.toggleAll(on)"
        @stop="selection.stop"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-pause"
          :disabled="selection.count.value === 0 || bulkBusy"
          @click="runBulk('pause')"
        >
          {{ $t('downloads.pause') }}
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-play"
          :disabled="selection.count.value === 0 || bulkBusy"
          @click="runBulk('resume')"
        >
          {{ $t('downloads.resume') }}
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-information-circle"
          :disabled="selection.count.value === 0"
          @click="() => { totalsOpen = true }"
        >
          {{ $t('selection.totals') }}
        </UButton>
        <UButton
          size="sm"
          color="error"
          variant="ghost"
          icon="i-heroicons-trash"
          :disabled="selection.count.value === 0 || bulkBusy"
          :loading="bulkBusy"
          @click="() => { bulkRemoveOpen = true }"
        >
          {{ $t('common.remove') }}
        </UButton>
      </SelectionBar>
      </div>
    </SmoothSwap>

    <SelectionTotalsModal
      v-model="totalsOpen"
      :count="selection.count.value"
      :facts="selectionFacts"
      :links="selectionLinks"
    />

    <!-- Removing deletes the partfiles, so a selection is confirmed with its size -->
    <UModal v-model:open="bulkRemoveOpen" :title="$t('selection.removeTitle')">
      <template #body>
        <p class="text-sm">
          <!-- The count goes in twice on purpose: once as a value to print, once
               as the plural choice -->
          {{ $t('selection.removeQuestion',
                { count: selection.count.value, size: formatBytes(selectionTotals.done) },
                selection.count.value) }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { bulkRemoveOpen = false }">
            {{ $t('downloads.keepIt') }}
          </UButton>
          <UButton color="error" :loading="bulkBusy" @click="confirmBulkRemove">
            {{ $t('common.remove') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <DownloadDetailsModal
      v-model="detailsOpen"
      :download="selected"
      @remove="askRemove"
    />

    <!-- Removing deletes the partfile, so confirm first -->
    <UModal v-model:open="removeOpen" :title="$t('downloads.removeTitle')">
      <template #body>
        <i18n-t keypath="downloads.removeQuestion" tag="p" class="text-sm" scope="global">
          <template #name><span class="font-semibold break-all">{{ pendingRemove?.name }}</span></template>
        </i18n-t>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { removeOpen = false }">{{ $t('downloads.keepIt') }}</UButton>
          <UButton color="error" :loading="busyHash === pendingRemove?.hash" @click="confirmRemove">
            {{ $t('common.remove') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Download } from '../../server/utils/amule-types';
import { classifyDownload } from '#shared/utils/downloadHealth';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '#shared/utils/format';
import type { SortOption } from '#shared/utils/sorting';

const { t } = useI18n();
useHead({ title: () => t('downloads.title') });

const {
  items,
  loading,
  error,
  busyHash,
  wsStatus,
  activeCount,
  searchingCount,
  totalSpeed,
  fetchDownloads,
  startPolling,
  pause,
  resume,
  remove,
  setPriority,
  pauseMany,
  resumeMany,
  removeMany
} = useDownloads();

startPolling();

const refreshing = ref(false);
const detailsOpen = ref(false);
const removeOpen = ref(false);
const selected = ref<Download | null>(null);
const pendingRemove = ref<Download | null>(null);

const sortOptions = computed<SortOption[]>(() => [
  { label: t('sort.progress'), value: 'progress', defaultDirection: 'desc' },
  { label: t('sort.speed'), value: 'speed', defaultDirection: 'desc' },
  { label: t('sort.size'), value: 'size', defaultDirection: 'desc' },
  { label: t('sort.sources'), value: 'sources', defaultDirection: 'desc' },
  { label: t('sort.name'), value: 'name', defaultDirection: 'asc' },
  { label: t('sort.status'), value: 'status', defaultDirection: 'asc' }
]);

/** One accessor per sort option, shared shape across every list page. */
const sortAccessors = {
  progress: (download: Download) => download.percentComplete,
  speed: (download: Download) => download.speed,
  size: (download: Download) => download.size,
  sources: (download: Download) => download.sources,
  name: (download: Download) => download.name,
  status: (download: Download) => classifyDownload(download).label
};

/**
 * A queue of a few thousand entries is normal on a long-running daemon, and every
 * row here carries a progress bar, a menu and a transition. Paging keeps the
 * rendered list a fixed size; filtering and sorting still run over all of it.
 */
const {
  search,
  sortBy,
  direction,
  page,
  pageSize,
  pageKey,
  visible: visibleDownloads,
  matching,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<Download>({
  items,
  fields: download => [download.name, download.hash],
  accessors: sortAccessors,
  sortBy: 'progress',
  direction: 'desc',
  storageKey: 'downloads'
});

/**
 * Selecting several downloads to act on at once.
 *
 * Fed the filtered and sorted list rather than the current page: selecting "all"
 * has to mean every download the filter matches, or Remove would quietly depend
 * on which page was open.
 */
const selection = useListSelection<Download>({
  items: matching,
  keyOf: download => download.hash
});

const totalsOpen = ref(false);
const bulkRemoveOpen = ref(false);
const bulkBusy = ref(false);

const selectionTotals = computed(() => selection.items.value.reduce(
  (sum, download) => ({
    size: sum.size + (download.size || 0),
    done: sum.done + (download.sizeDone || 0),
    speed: sum.speed + (download.speed || 0),
    sources: sum.sources + (download.sources || 0),
    complete: sum.complete + (download.percentComplete >= 100 ? 1 : 0)
  }),
  { size: 0, done: 0, speed: 0, sources: 0, complete: 0 }
));

const selectionFacts = computed(() => {
  const totals = selectionTotals.value;
  const remaining = Math.max(0, totals.size - totals.done);

  return [
    { label: t('selection.facts.files'), value: selection.count.value.toLocaleString() },
    { label: t('selection.facts.totalSize'), value: formatBytes(totals.size) },
    { label: t('selection.facts.downloaded'), value: formatBytes(totals.done) },
    { label: t('selection.facts.remaining'), value: formatBytes(remaining) },
    {
      label: t('selection.facts.progress'),
      value: totals.size > 0 ? formatPercent((totals.done / totals.size) * 100) : '-'
    },
    { label: t('selection.facts.speed'), value: formatSpeed(totals.speed) },
    // The whole selection's ETA, which is the question a selection is usually
    // about: not "when is this file done" but "when is all of this done"
    { label: t('selection.facts.eta'), value: formatEta(remaining, totals.speed) ?? '-' },
    { label: t('selection.facts.sources'), value: totals.sources.toLocaleString() },
    { label: t('selection.facts.completed'), value: totals.complete.toLocaleString() }
  ];
});

const selectionLinks = computed(() => selection.items.value
  .map(download => download.ed2kLink)
  .filter((link): link is string => Boolean(link)));

async function runBulk(action: 'pause' | 'resume') {
  bulkBusy.value = true;
  try {
    const picked = [...selection.items.value];
    if (action === 'pause') await pauseMany(picked);
    else await resumeMany(picked);
  } finally {
    bulkBusy.value = false;
  }
}

async function confirmBulkRemove() {
  bulkBusy.value = true;
  try {
    await removeMany([...selection.items.value]);
    bulkRemoveOpen.value = false;
    // Nothing is left to act on: the rows are gone
    selection.stop();
  } finally {
    bulkBusy.value = false;
  }
}

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
