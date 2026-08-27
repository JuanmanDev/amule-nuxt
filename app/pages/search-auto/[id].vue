<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ selected ? selected.keyword : $t('searchAuto.title') }}</h1>
        <p v-if="selected" class="text-gray-600 dark:text-gray-400">
          {{ $t('searchAuto.accumulatedSince', { time: time.dateTime(selected.createdAt) }) }}
        </p>
      </div>
      <UButton
        to="/search-auto"
        variant="outline"
        color="neutral"
        icon="i-heroicons-arrow-left"
      >
        {{ $t('common.back') || 'Back' }}
      </UButton>
    </div>

    <div v-if="loading" class="flex justify-center p-8">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <template v-else-if="selected">
      <SearchResultList
        v-if="selected.results.length > 0"
        :results="selected.results"
        storage-key="search-auto"
        :downloading-hash="downloadingHash || undefined"
        :list-id="selected.id"
        @open="openDetails"
        @download="addToDownloads"
      >
        <template #title="{ matched }">
          <h2 class="text-xl font-semibold truncate">
            {{ $t('searchAuto.listTitle') || 'Results' }}
            <span class="text-base font-normal text-gray-500 dark:text-gray-400">
              ({{ matched.toLocaleString() }})
            </span>
          </h2>
        </template>
      </SearchResultList>

      <UEmpty
        v-else
        icon="i-heroicons-clock"
        :title="$t('searchAuto.noResultsYetTitle')"
        :description="$t('searchAuto.noResultsYetDescription')"
      />
    </template>

    <SearchResultModal
      v-model="detailsOpen"
      :result="selectedResult"
      :status="statusOf(selectedResult?.hash)"
      :busy="downloadingHash === selectedResult?.hash"
      :search-label="selected ? `${selected.keyword} (${$t('searchAuto.title')})` : undefined"
      @download="addToDownloads"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import type { AutoSearch } from '../../../server/utils/autoSearchStore';
import type { SearchResult } from '../../../server/utils/amule-types';

const route = useRoute();
const id = route.params.id as string;
const api = useAmuleApi();
const toast = useToast();
const { t } = useI18n();
const time = useLocalTime();

const { statusOf } = useFileStatus();
const { addLinks } = useDownloads();

// Keeps downloads and shared states warm
useDownloadsFeed().focus();
useSharedFilesFeed().focus();

const selected = ref<AutoSearch | null>(null);
const loading = ref(true);

let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function refresh() {
  try {
    const response = await api.getAutoSearch(id);
    if (!response.success || !response.data) return;

    // We do simple assignment here. If we wanted to merge, we could.
    selected.value = response.data.search;
  } catch (e: any) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
  refreshTimer = setInterval(() => { void refresh(); }, 15000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

// ========== Downloading a result ==========

const detailsOpen = ref(false);
const selectedResult = ref<SearchResult | null>(null);
const downloadingHash = ref<string | null>(null);

function openDetails(result: SearchResult) {
  selectedResult.value = result;
  detailsOpen.value = true;
}

async function addToDownloads(result: SearchResult) {
  if (!result.ed2kLink) {
    toast.add({ title: t('search.result.cannotDownload'), description: t('search.result.noHash'), color: 'error' });
    return;
  }

  downloadingHash.value = result.hash;
  try {
    await addLinks(result.ed2kLink);
  } catch (e: any) {
    toast.add({ title: t('common.error'), description: e?.message, color: 'error' });
  } finally {
    downloadingHash.value = null;
  }
}
</script>
