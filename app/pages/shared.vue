<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('shared.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('shared.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton to="/uploads" variant="link" trailing-icon="i-heroicons-arrow-right" size="sm">
          {{ $t('shared.activeUploads') }}
        </UButton>
        <UButton
          :loading="refreshing"
          :disabled="loading"
          variant="outline"
          icon="i-heroicons-arrow-path"
          @click="refresh"
        >
          {{ $t('common.refresh') }}
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
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">{{ $t('shared.loading') }}</p>
      </div>

      <UAlert
        v-else-if="error && files.length === 0"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="$t('shared.loadFailed')"
        :description="error"
        :actions="[{ label: $t('common.retry'), color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <div v-else key="content" class="space-y-6">
        <SmoothSwap>
          <UAlert
            v-if="error"
            color="warning"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            :title="$t('shared.staleTitle')"
            :description="error"
            :actions="[{ label: $t('common.retry'), color: 'warning', variant: 'outline', onClick: () => refresh() }]"
          />
        </SmoothSwap>

      <!-- Totals -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('shared.filesShared') }}</div>
          <div class="text-2xl font-bold mt-1">{{ files.length.toLocaleString() }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('shared.totalSize') }}</div>
          <div class="text-2xl font-bold mt-1">{{ formatBytes(totals.size) }}</div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('shared.uploadedAllTime') }}</div>
          <div class="text-2xl font-bold mt-1 text-green-600">{{ formatBytes(totals.transferred) }}</div>
          <!-- Per-file counters live with the files and survive a statistics
               reset, so this total is usually above the daemon's own counter -->
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ $t('shared.perFileNote') }}
          </div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('shared.requestsAllTime') }}</div>
          <div class="text-2xl font-bold mt-1">{{ totals.requests.toLocaleString() }}</div>
        </div>
      </div>

      <SmoothSwap>
      <UEmpty
        v-if="files.length === 0"
        key="empty"
        icon="i-heroicons-document-text"
        :title="$t('shared.emptyTitle')"
        :description="$t('shared.emptyDescription')"
      />

      <UCard v-else key="list">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">{{ $t('shared.files', { count: matched.toLocaleString() }) }}</h2>
            <div class="flex items-center gap-2 flex-1 sm:flex-none sm:w-auto min-w-0">
              <ListControls
                v-model:search="search"
                v-model:sort-by="sortBy"
                v-model:direction="direction"
                :options="sortOptions"
                :placeholder="$t('shared.filterPlaceholder')"
                class="flex-1 sm:max-w-md"
              />
              <UButton
                v-if="!selection.active.value"
                icon="i-heroicons-check-circle"
                color="neutral"
                variant="outline"
                class="shrink-0"
                :aria-label="$t('selection.select')"
                @click="selection.start"
              >
                <span class="hidden sm:inline">{{ $t('selection.select') }}</span>
              </UButton>
            </div>
          </div>
        </template>

        <SmoothSwap>
        <UEmpty
          v-if="visibleFiles.length === 0"
          key="no-matches"
          icon="i-heroicons-magnifying-glass"
          :title="$t('common.noMatches')"
          :description="$t('shared.noMatchesDescription', { query: search })"
        />

        <AnimatedList v-else key="rows" gap="0.5rem" :reset-key="pageKey">
          <div
            v-for="file in visibleFiles"
            :key="file.hash || file.fileName"
            class="p-3 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            :class="selection.active.value && selection.has(keyOfFile(file)) ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-default' : ''"
            role="button"
            tabindex="0"
            :aria-label="$t('downloads.showDetailsFor', { name: file.fileName })"
            @click="onRowClick(file)"
            @keydown.enter.prevent="onRowClick(file)"
            @keydown.space.prevent="onRowClick(file)"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex items-start justify-between gap-2">
                <!-- While selecting, the whole row toggles; the box is a target,
                     not the only way in -->
                <UCheckbox
                  v-if="selection.active.value"
                  :model-value="selection.has(keyOfFile(file))"
                  class="shrink-0"
                  :aria-label="$t('selection.selectRow', { name: file.fileName })"
                  @update:model-value="value => selection.toggle(keyOfFile(file), value === true)"
                  @click.stop
                />
                <p class="font-medium truncate" :title="file.fileName">{{ file.fileName }}</p>
                <UBadge variant="subtle" size="sm" class="shrink-0" :color="file.onQueue > 0 ? 'info' : 'neutral'">
                  {{ file.onQueue > 0 ? $t('shared.queued', { count: file.onQueue }) : formatBytes(file.size) }}
                </UBadge>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs text-gray-600 dark:text-gray-400">
                <span>{{ $t('shared.row.size') }}: <span class="font-medium">{{ formatBytes(file.size) }}</span></span>
                <span>{{ $t('shared.row.sent') }}: <span class="font-medium">{{ formatBytes(file.transferredAll) }}</span></span>
                <span>{{ $t('shared.row.requests') }}: <span class="font-medium">{{ file.requestsAll.toLocaleString() }}</span></span>
                <span>{{ $t('shared.row.accepted') }}: <span class="font-medium">{{ file.acceptsAll.toLocaleString() }}</span></span>
                <span>{{ $t('shared.row.ratio') }}: <span class="font-medium">{{ file.shareRatio.toFixed(2) }}x</span></span>
              </div>
            </div>
          </div>
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
          label="files"
          class="mt-4"
        />

        <!-- Shared files are not transfers, so there is nothing to pause or
             cancel here: what a selection of them is good for is the links and
             the totals -->
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
            icon="i-heroicons-clipboard-document"
            :disabled="selectionLinks.length === 0"
            @click="copySelectedLinks"
          >
            {{ $t('selection.copyLinks') }}
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
        </SelectionBar>
      </UCard>
      </SmoothSwap>
      </div>
    </SmoothSwap>

    <SelectionTotalsModal
      v-model="totalsOpen"
      :count="selection.count.value"
      :facts="selectionFacts"
      :links="selectionLinks"
    />

    <!-- Details -->
    <UModal v-model:open="detailsOpen" :ui="{ content: 'max-w-3xl' }" :title="$t('shared.detailsTitle')">
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
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('shared.comment') }}</div>
            <p class="text-sm break-words">{{ selected.comment }}</p>
          </div>

          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.fileHash') }}</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ selected.hash || $t('common.unknown') }}</code>
              <UButton
                v-if="selected.hash"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyHash')"
                @click="copy(selected.hash, t('downloads.hashCopied'))"
              />
            </div>
          </div>

          <div v-if="selected.ed2kLink">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.ed2kLink') }}</div>
            <div class="flex items-start gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ selected.ed2kLink }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyLink')"
                @click="copy(selected.ed2kLink, t('downloads.linkCopied'))"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end w-full">
          <UButton color="neutral" variant="ghost" @click="() => { detailsOpen = false }">{{ $t('common.close') }}</UButton>
        </div>
      </template>
    </UModal>

    <RelatedPages :pages="['uploads', 'downloads', 'statistics']" />
  </div>
</template>

<script setup lang="ts">
import type { SharedFile } from '../../server/utils/amule-types';
import { formatBytes } from '#shared/utils/format';
import type { SortOption } from '#shared/utils/sorting';

const { copy } = useClipboard();

const { t } = useI18n();
const time = useLocalTime();
useHead({ title: () => t('shared.title') });

// Shared, prefetched feed: refreshed once a minute in the background, faster
// while this page is open, and never re-fetched from scratch on a revisit.
const feed = useSharedFilesFeed();
const { items: files, loading, error } = feed;
feed.focus();

const refreshing = ref(false);
const detailsOpen = ref(false);
const selected = ref<SharedFile | null>(null);

const sortOptions = computed<SortOption[]>(() => [
  { label: t('sort.uploaded'), value: 'transferred', defaultDirection: 'desc' },
  { label: t('sort.requests'), value: 'requests', defaultDirection: 'desc' },
  { label: t('sort.size'), value: 'size', defaultDirection: 'desc' },
  { label: t('sort.shareRatio'), value: 'ratio', defaultDirection: 'desc' },
  { label: t('sort.queuedClients'), value: 'queue', defaultDirection: 'desc' },
  { label: t('sort.name'), value: 'name', defaultDirection: 'asc' },
  // Recorded by this app rather than reported by aMule, so a file it never
  // watched being downloaded has no date at all - see the accessors below
  { label: t('shared.fields.completedAt'), value: 'completed', defaultDirection: 'desc' },
  { label: t('shared.fields.addedAt'), value: 'added', defaultDirection: 'desc' }
]);

const sortAccessors = {
  transferred: (file: SharedFile) => file.transferredAll,
  requests: (file: SharedFile) => file.requestsAll,
  size: (file: SharedFile) => file.size,
  ratio: (file: SharedFile) => file.shareRatio,
  queue: (file: SharedFile) => file.onQueue,
  name: (file: SharedFile) => file.fileName,
  /*
   * A file with no recorded date counts as older than any dated one.
   *
   * Most of a long-standing library has no date: the timestamps only exist for
   * downloads this app watched finish. Both options therefore default to newest
   * first, which is the direction that puts the dated files at the top; flipping
   * to oldest first leads with the undated ones, which is the honest answer to
   * "sort by date" when the date is not known.
   */
  completed: (file: SharedFile) => file.completedAt ?? -1,
  added: (file: SharedFile) => file.addedAt ?? -1
};

const totals = computed(() => files.value.reduce(
  (sum, file) => ({
    size: sum.size + file.size,
    transferred: sum.transferred + file.transferredAll,
    requests: sum.requests + file.requestsAll
  }),
  { size: 0, transferred: 0, requests: 0 }
));

// The heaviest list in the app: a seeded daemon shares tens of thousands of files
// and rendering them all is what made this page crawl. Paging is what fixed it.
const {
  search,
  sortBy,
  direction,
  page,
  pageSize,
  pageKey,
  visible: visibleFiles,
  matching,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<SharedFile>({
  items: files,
  fields: file => [file.fileName, file.hash, file.fullPath],
  accessors: sortAccessors,
  sortBy: 'transferred',
  direction: 'desc',
  storageKey: 'shared'
});

/**
 * Selecting several shared files.
 *
 * Keyed the same way the rows are, and fed the filtered list rather than the
 * page, so "all" means every file the filter matches.
 */
const keyOfFile = (file: SharedFile) => file.hash || file.fileName;

const selection = useListSelection<SharedFile>({
  items: matching,
  keyOf: keyOfFile
});

const totalsOpen = ref(false);

function onRowClick(file: SharedFile) {
  if (selection.active.value) {
    selection.toggle(keyOfFile(file));
    return;
  }
  openDetails(file);
}

const selectionLinks = computed(() => selection.items.value
  .map(file => file.ed2kLink)
  .filter((link): link is string => Boolean(link)));

const selectionFacts = computed(() => {
  const picked = selection.items.value;
  const totals = picked.reduce(
    (sum, file) => ({
      size: sum.size + file.size,
      sent: sum.sent + file.transferredAll,
      session: sum.session + file.transferred,
      requests: sum.requests + file.requestsAll,
      accepted: sum.accepted + file.acceptsAll,
      queued: sum.queued + file.onQueue
    }),
    { size: 0, sent: 0, session: 0, requests: 0, accepted: 0, queued: 0 }
  );

  return [
    { label: t('selection.facts.files'), value: picked.length.toLocaleString() },
    { label: t('selection.facts.totalSize'), value: formatBytes(totals.size) },
    { label: t('selection.facts.uploaded'), value: formatBytes(totals.sent) },
    { label: t('selection.facts.sentSession'), value: formatBytes(totals.session) },
    // Bytes sent over bytes shared, not the mean of the per-file ratios: a 2 KB
    // file sent a thousand times would otherwise dominate the average
    {
      label: t('selection.facts.shareRatio'),
      value: totals.size > 0 ? `${(totals.sent / totals.size).toFixed(2)}x` : '-'
    },
    { label: t('selection.facts.requests'), value: totals.requests.toLocaleString() },
    { label: t('shared.row.accepted'), value: totals.accepted.toLocaleString() },
    { label: t('selection.facts.queued'), value: totals.queued.toLocaleString() }
  ];
});

function copySelectedLinks() {
  const count = selectionLinks.value.length;
  copy(selectionLinks.value.join('\n'), t('selection.linksCopied', { count }, count));
}

const facts = computed(() => {
  const file = selected.value;
  if (!file) return [];

  return [
    { label: t('shared.fields.size'), value: formatBytes(file.size) },
    { label: t('shared.fields.uploadedAll'), value: formatBytes(file.transferredAll) },
    { label: t('shared.fields.uploadedSession'), value: formatBytes(file.transferred) },
    { label: t('shared.fields.shareRatio'), value: `${file.shareRatio.toFixed(2)}x` },
    { label: t('shared.fields.requestsAll'), value: file.requestsAll.toLocaleString() },
    { label: t('shared.fields.requestsSession'), value: file.requests.toLocaleString() },
    { label: t('shared.fields.acceptedAll'), value: file.acceptsAll.toLocaleString() },
    { label: t('shared.fields.acceptedSession'), value: file.accepts.toLocaleString() },
    { label: t('shared.fields.clientsQueued'), value: file.onQueue.toLocaleString() },
    { label: t('shared.fields.completeSources'), value: file.completeSources.toLocaleString() },
    /*
     * Always shown, even with nothing to show.
     *
     * These come from this app's own record of the download queue, not from
     * aMule, which keeps no such timestamp - so a file shared before this app
     * ever ran has neither. Hiding the field then made it look as though the
     * information did not exist at all; saying "not recorded" explains why this
     * particular file has none while others do.
     */
    { label: t('shared.fields.addedAt'), value: file.addedAt ? time.dateTime(file.addedAt) : t('shared.notRecorded') },
    { label: t('shared.fields.completedAt'), value: file.completedAt ? time.dateTime(file.completedAt) : t('shared.notRecorded') },
    { label: t('shared.fields.uploadPriority'), value: `${t('downloads.priorities.' + file.priority)}${file.autoPriority ? ' ' + t('downloads.priorities.autoSuffix') : ''}` }
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


</script>
