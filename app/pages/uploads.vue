<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('uploads.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('uploads.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <USwitch v-model="autoRefresh" :label="$t('uploads.autoRefresh')" />
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

    <!-- Loading only before the very first read of the session; afterwards the
         cached list stays on screen while it refreshes, which is what stops it
         appearing and disappearing -->
    <SmoothSwap>
      <div v-if="loading" key="loading" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
        </div>
        <USkeleton v-for="n in 4" :key="`row-${n}`" class="h-16 w-full" />
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">{{ $t('uploads.loading') }}</p>
      </div>

      <UAlert
        v-else-if="error && uploads.length === 0"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="$t('uploads.loadFailed')"
        :description="error"
        :actions="[{ label: $t('common.retry'), color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <div v-else key="content" class="space-y-6">
        <!-- A failed refresh with a list in hand is reported above it, so the
             page stays usable instead of collapsing into an error box -->
        <SmoothSwap>
          <UAlert
            v-if="error"
            color="warning"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            :title="$t('uploads.staleTitle')"
            :description="error"
            :actions="[{ label: $t('common.retry'), color: 'warning', variant: 'outline', onClick: () => refresh() }]"
          />
        </SmoothSwap>

        <!-- Totals -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('uploads.clientsUploading') }}</div>
            <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="activeUploads.length" /></div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('uploads.totalUploadSpeed') }}</div>
            <div class="text-2xl font-bold mt-1 text-green-600">
              <AnimatedValue :model-value="formatSpeed(totalSpeed)" />
            </div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('uploads.sentThisSession') }}</div>
            <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="formatBytes(sessionTotal)" /></div>
          </div>
          <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ $t('uploads.waitingInQueue') }}</div>
            <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="queuedUploads.length" /></div>
          </div>
        </div>

        <SmoothSwap>
          <UEmpty
            v-if="uploads.length === 0"
            key="empty"
            icon="i-heroicons-arrow-up-tray"
            :title="$t('uploads.emptyTitle')"
            :description="$t('uploads.emptyDescription')"
          />

          <UCard v-else key="list">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-xl font-semibold">{{ $t('uploads.transfers', { count: matched.toLocaleString() }) }}</h2>
                <div class="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
                  <ListControls
                    v-model:search="search"
                    v-model:sort-by="sortBy"
                    v-model:direction="direction"
                    :options="sortOptions"
                    :placeholder="$t('uploads.filterPlaceholder')"
                    class="flex-1 sm:max-w-md"
                  />
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
                </div>
              </div>
            </template>

            <SmoothSwap>
              <UEmpty
                v-if="visibleUploads.length === 0"
                key="no-matches"
                icon="i-heroicons-magnifying-glass"
                :title="$t('common.noMatches')"
                :description="$t('uploads.noMatchesDescription', { query: search })"
              />

              <!-- A client that starts uploading pushes the list open, one that
                   disconnects closes its gap, and a re-sort glides the rows -->
              <AnimatedList v-else key="rows" gap="0.75rem" :reset-key="pageKey">
                <div
                  v-for="upload in visibleUploads"
                  :key="keyOfUpload(upload)"
                  class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-default/40 backdrop-blur-sm transition-colors"
                  :class="selection.active.value
                    ? ['cursor-pointer', selection.has(keyOfUpload(upload)) ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-default' : 'hover:bg-elevated/60']
                    : []"
                  @click="selection.active.value && selection.toggle(keyOfUpload(upload))"
                >
                  <div class="min-w-0 space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <UCheckbox
                        v-if="selection.active.value"
                        :model-value="selection.has(keyOfUpload(upload))"
                        class="shrink-0"
                        :aria-label="$t('selection.selectRow', { name: upload.fileName })"
                        @update:model-value="value => selection.toggle(keyOfUpload(upload), value === true)"
                        @click.stop
                      />
                      <p class="font-semibold truncate" :title="upload.fileName">{{ upload.fileName }}</p>
                      <UBadge
                        :color="upload.speed > 0 ? 'success' : 'neutral'"
                        variant="subtle"
                        size="sm"
                        class="shrink-0"
                      >
                        <AnimatedValue :model-value="upload.speed > 0 ? formatSpeed(upload.speed) : $t('uploads.idle')" />
                      </UBadge>
                    </div>

                    <p
                      v-if="upload.remoteFileName && upload.remoteFileName !== upload.fileName"
                      class="text-xs text-gray-500 dark:text-gray-400 truncate"
                      :title="upload.remoteFileName"
                    >
                      {{ $t('uploads.requestedAs', { name: upload.remoteFileName }) }}
                    </p>

                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.user') }}</span>
                        <span class="font-medium truncate" :title="upload.user">{{ upload.user }}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.address') }}</span>
                        <span class="font-medium font-mono text-xs truncate">
                          {{ upload.userIp || '-' }}<span v-if="upload.userPort">:{{ upload.userPort }}</span>
                        </span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.client') }}</span>
                        <span class="font-medium truncate">{{ upload.clientSoftware || 'Unknown' }}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.session') }}</span>
                        <span class="font-medium">{{ formatBytes(upload.transferred) }}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.allTime') }}</span>
                        <span class="font-medium">{{ formatBytes(upload.transferredTotal) }}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('uploads.fields.queueScore') }}</span>
                        <span class="font-medium">
                          {{ upload.waitingPosition > 0 ? `#${upload.waitingPosition}` : $t('uploads.uploadingNow') }}
                          <span class="text-gray-400">/ {{ upload.score }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </AnimatedList>
            </SmoothSwap>

            <!-- In the body rather than the card footer: the bar hides itself on a
                 short list, and a footer slot would still draw its divider -->
            <ListPagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :page-count="pageCount"
              :matched="matched"
              :total="total"
              :first-on-page="firstOnPage"
              :last-on-page="lastOnPage"
              label="transfers"
              class="mt-4"
            />

            <!-- No pause or cancel: aMule's External Connection exposes no way to
                 control an individual upload. What is useful about a selection
                 here is the links and the totals. -->
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
  </div>
</template>

<script setup lang="ts">
import type { Upload } from '../../server/utils/amule-types';
import { formatBytes, formatSpeed } from '#shared/utils/format';
import type { SortOption } from '#shared/utils/sorting';

const { t } = useI18n();
useHead({ title: () => t('uploads.title') });

// Shared, prefetched feed: the list is already there when the page opens, and it
// survives navigating away and back instead of restarting from a skeleton.
const feed = useUploadsFeed();
const { items: uploads, loading, error } = feed;

// Read only to turn an upload's hash into a link; the shared list is kept warm
// app-wide anyway
const { items: sharedFiles } = useSharedFilesFeed();
const { copy } = useClipboard();

const refreshing = ref(false);
const autoRefresh = ref(true);
// Fast cadence while this page is open and the switch is on; the feed keeps
// refreshing in the background either way.
feed.focus(autoRefresh);

const sortOptions = computed<SortOption[]>(() => [
  { label: t('sort.speed'), value: 'speed', defaultDirection: 'desc' },
  { label: t('sort.sentSession'), value: 'session', defaultDirection: 'desc' },
  { label: t('sort.sentAllTime'), value: 'total', defaultDirection: 'desc' },
  { label: t('sort.queuePosition'), value: 'queue', defaultDirection: 'asc' },
  { label: t('sort.fileName'), value: 'file', defaultDirection: 'asc' },
  { label: t('sort.user'), value: 'user', defaultDirection: 'asc' }
]);

const sortAccessors = {
  speed: (upload: Upload) => upload.speed,
  session: (upload: Upload) => upload.transferred,
  total: (upload: Upload) => upload.transferredTotal,
  queue: (upload: Upload) => upload.waitingPosition,
  file: (upload: Upload) => upload.fileName,
  user: (upload: Upload) => upload.user
};

const activeUploads = computed(() => uploads.value.filter(upload => upload.speed > 0));
const queuedUploads = computed(() => uploads.value.filter(upload => upload.waitingPosition > 0));
const totalSpeed = computed(() => uploads.value.reduce((sum, upload) => sum + upload.speed, 0));
const sessionTotal = computed(() => uploads.value.reduce((sum, upload) => sum + upload.transferred, 0));

// A well-seeded daemon serves hundreds of peers at once, so the transfer list is
// paged like the others; the totals above always cover every upload.
const {
  search,
  sortBy,
  direction,
  page,
  pageSize,
  pageKey,
  visible: visibleUploads,
  matching,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<Upload>({
  items: uploads,
  fields: upload => [upload.fileName, upload.user, upload.userIp, upload.clientSoftware],
  accessors: sortAccessors,
  sortBy: 'speed',
  direction: 'desc',
  storageKey: 'uploads'
});

/**
 * An upload has no id of its own: it is one peer transferring one file, so the
 * peer and the file together are the key. The same one the rows render with.
 */
const keyOfUpload = (upload: Upload) => `${upload.fileHash}@${upload.userIp}:${upload.userPort}`;

const selection = useListSelection<Upload>({
  items: matching,
  keyOf: keyOfUpload
});

const totalsOpen = ref(false);

/*
 * Links for the selected uploads, resolved through the shared files.
 *
 * An upload does not carry a file size, so its link cannot be built from it -
 * but you can only upload what you share, so the shared list has the same hash
 * with a link already on it. Deduplicated, because ten peers pulling one file
 * is ten uploads of one link.
 */
const sharedByHash = computed(() => {
  const map = new Map<string, string>();
  for (const file of sharedFiles.value) {
    if (file.hash && file.ed2kLink) map.set(file.hash.toLowerCase(), file.ed2kLink);
  }
  return map;
});

const selectionLinks = computed(() => [...new Set(
  selection.items.value
    .map(upload => sharedByHash.value.get((upload.fileHash || '').toLowerCase()))
    .filter((link): link is string => Boolean(link))
)]);

const selectionFacts = computed(() => {
  const picked = selection.items.value;
  const totals = picked.reduce(
    (sum, upload) => ({
      speed: sum.speed + upload.speed,
      session: sum.session + upload.transferred,
      total: sum.total + upload.transferredTotal,
      queued: sum.queued + (upload.waitingPosition > 0 ? 1 : 0)
    }),
    { speed: 0, session: 0, total: 0, queued: 0 }
  );

  return [
    { label: t('uploads.clientsUploading'), value: picked.length.toLocaleString() },
    { label: t('selection.facts.users'), value: new Set(picked.map(upload => upload.userIp)).size.toLocaleString() },
    { label: t('selection.facts.files'), value: new Set(picked.map(upload => upload.fileHash)).size.toLocaleString() },
    { label: t('selection.facts.speed'), value: formatSpeed(totals.speed) },
    { label: t('selection.facts.sentSession'), value: formatBytes(totals.session) },
    { label: t('selection.facts.uploaded'), value: formatBytes(totals.total) },
    { label: t('uploads.waitingInQueue'), value: totals.queued.toLocaleString() }
  ];
});

function copySelectedLinks() {
  const count = selectionLinks.value.length;
  copy(selectionLinks.value.join('\n'), t('selection.linksCopied', { count }, count));
}

async function refresh() {
  refreshing.value = true;
  await feed.refresh({ force: true });
  refreshing.value = false;
}
</script>
