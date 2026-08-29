<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('search.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('search.subtitle') }}</p>
      </div>
      <!-- The sibling page: the same keywords, run by the server for hours -->
      <UButton
        to="/search-auto"
        variant="outline"
        color="neutral"
        icon="i-heroicons-arrow-path-rounded-square"
      >
        {{ $t('search.autoLink') }}
      </UButton>
    </div>

    <!-- One row from md up: network, keywords and the buttons that act on them.
         The form used to stack a labelled select over a labelled input over a
         button row, which cost three rows of a wide screen to ask one question. -->
    <UCard>
      <UForm :state="form" class="space-y-2" @submit="startSearch">
        <div class="flex flex-col md:flex-row md:items-center gap-3">
          <USelect
            v-model="form.type"
            :items="searchTypes"
            value-key="value"
            label-key="label"
            size="lg"
            class="md:w-52 shrink-0"
            :aria-label="$t('search.networkLabel')"
          />

          <UInput
            v-model="form.keyword"
            :placeholder="$t('search.keywordsPlaceholder')"
            size="lg"
            icon="i-heroicons-magnifying-glass"
            class="flex-1 min-w-0"
            :aria-label="$t('search.keywordsLabel')"
            @keydown.enter.prevent="startSearch"
          />

          <div class="flex items-center gap-2 shrink-0">
            <UButton
              type="submit"
              size="lg"
              :loading="starting"
              :disabled="!form.keyword.trim()"
              icon="i-heroicons-magnifying-glass"
            >
              {{ $t('search.start') }}
            </UButton>

            <!-- Same slot on purpose: while a search runs the useful action is
                 stopping it, and once it has finished it is reading it again -->
            <UButton
              v-if="running"
              size="lg"
              color="neutral"
              variant="outline"
              icon="i-heroicons-stop"
              @click="searches.stop()"
            >
              {{ $t('search.stop') }}
            </UButton>
            <UButton
              v-else-if="activeIsCurrent && active"
              size="lg"
              variant="outline"
              icon="i-heroicons-arrow-path"
              :loading="refreshing"
              @click="refreshResults"
            >
              <span class="hidden sm:inline">{{ $t('search.refreshResults') }}</span>
            </UButton>
            <UButton
              v-else-if="active"
              size="lg"
              variant="outline"
              icon="i-heroicons-arrow-path"
              :title="$t('search.runAgain')"
              @click="searches.rerun(active)"
            >
              <span class="hidden sm:inline">{{ $t('search.runAgain') }}</span>
            </UButton>
          </div>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ $t('search.tabsHelp') }}
        </p>
      </UForm>
    </UCard>

    <!-- Searches, one tab each -->
    <div v-if="sessions.length > 0" class="flex items-center gap-2 overflow-x-auto pb-1">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center gap-1 shrink-0 rounded-lg border px-2 py-1 transition-colors"
        :class="session.id === activeId
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
          : 'border-gray-200 dark:border-gray-800 hover:bg-elevated/60'"
      >
        <button
          type="button"
          class="flex items-center gap-2 text-sm min-w-0"
          :aria-current="session.id === activeId ? 'true' : undefined"
          @click="searches.select(session.id)"
        >
          <UIcon
            v-if="session.status === 'running'"
            name="i-heroicons-arrow-path"
            class="w-3.5 h-3.5 animate-spin shrink-0"
          />
          <UIcon
            v-else-if="session.status === 'failed'"
            name="i-heroicons-exclamation-circle"
            class="w-3.5 h-3.5 shrink-0 text-red-500"
          />
          <span class="font-medium truncate max-w-[12rem]">{{ session.keyword }}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">
            {{ session.type }} · {{ session.results.length.toLocaleString() }}
          </span>
        </button>
        <UButton
          icon="i-heroicons-x-mark"
          variant="link"
          color="neutral"
          size="xs"
          :aria-label="$t('search.closeTab', { keyword: session.keyword })"
          @click="searches.close(session.id)"
        />
      </div>
    </div>

    <!-- Live progress while the network answers -->
    <SmoothSwap>
      <UCard v-if="running" key="progress">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              {{ $t('search.searchingFor', { network: active?.type, keyword: active?.keyword }) }}
            </span>
            <span class="text-gray-500 dark:text-gray-400">
              <AnimatedValue :model-value="active?.results.length ?? 0" /> {{ $t('search.resultsSoFar') }}
            </span>
          </div>
          <UProgress animation="carousel" />
        </div>
      </UCard>
    </SmoothSwap>

    <SmoothSwap>
      <UAlert
        v-if="active?.status === 'failed'"
        key="failed"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="$t('search.failedTitle')"
        :description="active.error"
        :actions="[{ label: $t('search.tryAgain'), color: 'error', variant: 'outline', onClick: () => searches.rerun(active!) }]"
      />

      <SearchResultList
        v-else-if="active && active.results.length > 0"
        key="results"
        :results="active.results"
        storage-key="search"
        :downloading-hash="downloadingHash || undefined"
        :list-id="activeId ?? undefined"
        @open="openDetails"
        @download="addToDownloads"
      >
        <template #title="{ matched }">
          <h2 class="text-xl font-semibold truncate">
            {{ active.keyword }}
            <span class="text-base font-normal text-gray-500 dark:text-gray-400">
              ({{ matched.toLocaleString() }})
            </span>
          </h2>
          <!-- An older tab is a snapshot: say when it was taken rather than
               letting numbers that stopped moving look live -->
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ active.type }} ·
            <template v-if="activeIsCurrent">{{ $t('search.readAt', { time: updatedLabel }) }}</template>
            <template v-else>{{ $t('search.snapshotAt', { time: updatedLabel }) }}</template>
          </p>
        </template>
      </SearchResultList>

      <UEmpty
        v-else-if="active && active.status !== 'running'"
        key="no-results"
        icon="i-heroicons-magnifying-glass"
        :title="$t('search.noResultsTitle')"
        :description="$t('search.noResultsDescription')"
      />

      <UEmpty
        v-else-if="sessions.length === 0"
        key="idle"
        icon="i-heroicons-magnifying-glass"
        :title="$t('search.idleTitle')"
        :description="$t('search.idleDescription')"
      />
    </SmoothSwap>

    <SearchResultModal
      v-model="detailsOpen"
      :result="selected"
      :status="statusOf(selected?.hash)"
      :busy="downloadingHash === selected?.hash"
      :search-label="active ? `${active.keyword} (${active.type})` : undefined"
      @download="addToDownloads"
    />

    <RelatedPages :pages="['searchAuto', 'downloads', 'servers', 'shared']" />
  </div>
</template>

<script setup lang="ts">
import type { SearchResult, SearchType } from '../../server/utils/amule-types';
import type { SortOption } from '#shared/utils/sorting';
import { fileKind } from '#shared/utils/fileKind';

const api = useAmuleApi();
const toast = useToast();

const { t } = useI18n();
const time = useLocalTime();
useHead({ title: () => t('search.title') });

const searches = useSearches();
const { sessions, activeId, active, activeIsCurrent, running } = searches;

// Searches the server kept from the last seven days, including ones started in
// another browser. Read after mount so the page renders immediately either way.
onMounted(searches.restore);
const { statusOf } = useFileStatus();
const { addLinks } = useDownloads();

// The queue and the shared list are what tell a result apart from a download, so
// this page keeps them warm while it is open.
const downloadsFeed = useDownloadsFeed();
downloadsFeed.focus();
useSharedFilesFeed().focus();

const searchTypes = computed(() => [
  { label: t('search.networks.kad'), value: 'Kad' },
  { label: t('search.networks.global'), value: 'Global' },
  { label: t('search.networks.local'), value: 'Local' }
]);

const form = reactive({
  type: 'Kad' as SearchType,
  keyword: ''
});

const starting = ref(false);
const refreshing = ref(false);
const detailsOpen = ref(false);
const selected = ref<SearchResult | null>(null);
const downloadingHash = ref<string | null>(null);

const updatedLabel = computed(() => {
  const at = active.value?.updatedAt;
  if (!at) return t('search.notYet');
  // After mount only: the server's clock formats differently from the browser's
  return time.timeOfDay(at);
});

async function startSearch() {
  starting.value = true;
  await searches.start(form.type, form.keyword);
  starting.value = false;
}

async function refreshResults() {
  refreshing.value = true;
  await searches.refresh();
  refreshing.value = false;
}

function openDetails(result: SearchResult) {
  selected.value = result;
  detailsOpen.value = true;
}

/**
 * Starts the download for a result.
 *
 * Two routes, because the daemon only remembers the search it is holding: the
 * current search can be downloaded from by hash, while an older tab is added by
 * its eD2k link - which is built from the result itself and stays valid for as
 * long as the file exists.
 */
async function addToDownloads(result: SearchResult) {
  if (!result.hash) {
    toast.add({
      title: t('search.result.cannotDownload'),
      description: t('search.result.noHash'),
      color: 'error'
    });
    return;
  }

  downloadingHash.value = result.hash;
  try {
    if (activeIsCurrent.value) {
      const response = await api.downloadFromSearch(result.hash);
      if (response.success) {
        toast.add({ title: response.message || t('search.result.downloadAdded'), color: 'success' });
        // So the row turns into its "Added" state now rather than at the next poll
        await downloadsFeed.refresh({ force: true });
        return;
      }

      // Fall through to the link: a stale result number is exactly the case the
      // link exists for, and refusing here would be a dead end for the user.
      if (!result.ed2kLink) {
        toast.add({ title: t('search.result.failedToStart'), description: response.error, color: 'error' });
        return;
      }
    }

    await addLinks(result.ed2kLink);
  } catch (e: any) {
    toast.add({ title: t('common.error'), description: e.message, color: 'error' });
  } finally {
    downloadingHash.value = null;
  }
}
</script>
