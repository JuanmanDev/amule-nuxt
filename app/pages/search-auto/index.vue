<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('searchAuto.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('searchAuto.subtitle') }}</p>
      </div>
      <UButton
        to="/search"
        variant="outline"
        color="neutral"
        icon="i-heroicons-magnifying-glass"
      >
        {{ $t('searchAuto.backToSearch') }}
      </UButton>
    </div>

    <!-- Why this page exists: files live on machines that come and go, and one
         search only ever asks the machines awake right now. -->
    <UAlert
      icon="i-heroicons-light-bulb"
      color="primary"
      variant="subtle"
      :title="$t('searchAuto.howTitle')"
      :description="$t('searchAuto.howDescription')"
    />

    <UCard>
      <UForm :state="form" class="space-y-4" @submit="create">
        <div class="flex flex-col lg:flex-row lg:items-end gap-4">
          <UFormField :label="$t('search.keywordsLabel')" class="flex-1 min-w-0">
            <UInput
              v-model="form.keyword"
              :placeholder="$t('search.keywordsPlaceholder')"
              size="lg"
              icon="i-heroicons-magnifying-glass"
              class="w-full"
              @keydown.enter.prevent="create"
            />
          </UFormField>

          <UFormField :label="$t('searchAuto.networksLabel')">
            <div class="flex items-center gap-1">
              <UButton
                v-for="network in networkOptions"
                :key="network.value"
                :color="form.networks.includes(network.value) ? 'primary' : 'neutral'"
                :variant="form.networks.includes(network.value) ? 'soft' : 'outline'"
                size="lg"
                :aria-pressed="form.networks.includes(network.value)"
                @click="toggleNetwork(network.value)"
              >
                {{ network.label }}
              </UButton>
            </div>
          </UFormField>

          <UFormField :label="$t('searchAuto.durationLabel')">
            <USelect
              v-model="form.duration"
              :items="durationOptions"
              value-key="value"
              label-key="label"
              size="lg"
              class="w-full lg:w-48"
            />
          </UFormField>

          <UButton
            type="submit"
            size="lg"
            icon="i-heroicons-play"
            :loading="creating"
            :disabled="!form.keyword.trim() || form.networks.length === 0"
            class="shrink-0"
          >
            {{ $t('searchAuto.start') }}
          </UButton>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ $t('searchAuto.formHelp', { minutes: 5 }) }}
        </p>
      </UForm>
    </UCard>

    <!-- The searches themselves -->
    <UCard v-if="loaded && summaries.length > 0">
      <template #header>
        <h2 class="text-xl font-semibold">{{ $t('searchAuto.listTitle') }}</h2>
      </template>

      <div class="space-y-3">
        <NuxtLink
          v-for="search in summaries"
          :key="search.id"
          :to="`/search-auto/${search.id}`"
          class="block rounded-lg border p-3 transition-colors hover:border-primary-500"
          :class="search.id === selectedId
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
            : 'border-gray-200 dark:border-gray-800'"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-1 items-center gap-2 min-w-0 text-left justify-between transition-colors">
              <div class="font-medium truncate flex items-center gap-2">
                {{ search.keyword }}
                <UBadge :color="statusColor(search.status)" variant="subtle" size="sm">
                  {{ search.status }}
                </UBadge>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <UButton
                v-if="search.status === 'finished' || search.status === 'stopped'"
                icon="i-heroicons-play"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.resumeOne')"
                @click.prevent.stop="resumeOne(search.id)"
              />
              <UButton
                v-if="search.status === 'active'"
                icon="i-heroicons-stop"
                variant="ghost"
                color="neutral"
                size="sm"
                :title="$t('searchAuto.stopOne')"
                @click.prevent.stop="stopOne(search.id)"
              />
              <UButton
                icon="i-heroicons-trash"
                variant="ghost"
                color="error"
                size="sm"
                :title="$t('searchAuto.deleteOne')"
                @click.prevent.stop="removeOne(search)"
              />
            </div>
          </div>

          <div class="mt-2 text-sm text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>{{ $t('searchAuto.networks', { count: search.networks.length, list: search.networks.join(', ') }) }}</span>
            <span v-if="search.status === 'active'">{{ nextPassLabel(search) }}</span>
            <span v-if="search.endsAt">{{ $t('searchAuto.until', { time: time.dateTime(search.endsAt) }) }}</span>
            <span v-else>{{ $t('searchAuto.untilStopped') }}</span>
          </div>

          <p v-if="search.lastError" class="mt-1 text-sm text-red-500">
            {{ $t('searchAuto.lastPassFailed', { error: search.lastError }) }}
          </p>
        </NuxtLink>
      </div>
    </UCard>

    <UEmpty
      v-else-if="loaded"
      icon="i-heroicons-arrow-path-rounded-square"
      :title="$t('searchAuto.emptyTitle')"
      :description="$t('searchAuto.emptyDescription')"
    />



    <RelatedPages :pages="['search', 'downloads', 'servers', 'connection']" />
  </div>
</template>

<script setup lang="ts">
import type { SearchResult, SearchType } from '../../../server/utils/amule-types';
import type { AutoSearch, AutoSearchDuration } from '../../../server/utils/autoSearchStore';
import type { AutoSearchSummary } from '../../../server/api/amule/search/auto/index.get';
import type { SortOption } from '#shared/utils/sorting';
import { fileKind } from '#shared/utils/fileKind';
import { mergeCollections } from '#shared/utils/mergeCollections';

const api = useAmuleApi();
const toast = useToast();
const { t } = useI18n();
const time = useLocalTime();
useHead({ title: () => t('searchAuto.title') });

const { statusOf } = useFileStatus();
const { addLinks } = useDownloads();

// Same reason as the search page: what tells a result apart from a download.
useDownloadsFeed().focus();
useSharedFilesFeed().focus();

// ========== The list of automatic searches ==========

const summaries = ref<AutoSearchSummary[]>([]);
const loaded = ref(false);
const selectedId = ref<string | null>(null);
const selected = ref<AutoSearch | null>(null);

/** The page re-reads everything this often; passes run server-side regardless. */
const REFRESH_MS = 15 * 1000;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

async function refresh() {
  try {
    const response = await api.getAutoSearches();
    if (!response.success) return;

    summaries.value = response.data?.searches ?? [];
    loaded.value = true;

    if (selectedId.value && !summaries.value.some(search => search.id === selectedId.value)) {
      selectedId.value = null;
      selected.value = null;
    }
    // First visit: show the newest search without asking for a click
    if (!selectedId.value && summaries.value.length > 0) {
      await select(summaries.value[0]!.id);
      return;
    }

    if (selectedId.value) await readSelected(selectedId.value);
  } catch {
    // The next interval retries; a failed poll is not worth a toast
  }
}

async function readSelected(id: string) {
  const response = await api.getAutoSearch(id);
  if (!response.success || !response.data) return;

  const fresh = response.data.search;
  const previous = selected.value;

  // Merged so rows keep their objects between polls and do not re-animate
  selected.value = previous && previous.id === fresh.id
    ? {
        ...fresh,
        results: mergeCollections(previous.results, fresh.results, result => result.hash || `#${result.resultNumber}`)
      }
    : fresh;
}

async function select(id: string) {
  selectedId.value = id;
  await readSelected(id);
}

onMounted(() => {
  void refresh();
  refreshTimer = setInterval(() => { void refresh(); }, REFRESH_MS);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

// ========== Creating one ==========

const networkOptions = computed(() => [
  { label: t('search.networks.kad'), value: 'Kad' as SearchType },
  { label: t('search.networks.global'), value: 'Global' as SearchType },
  { label: t('search.networks.local'), value: 'Local' as SearchType }
]);

const durationOptions = computed(() => [
  { label: t('searchAuto.durations.1h'), value: '1h' as AutoSearchDuration },
  { label: t('searchAuto.durations.1d'), value: '1d' as AutoSearchDuration },
  { label: t('searchAuto.durations.1w'), value: '1w' as AutoSearchDuration },
  { label: t('searchAuto.durations.1m'), value: '1m' as AutoSearchDuration },
  { label: t('searchAuto.durations.forever'), value: 'forever' as AutoSearchDuration }
]);

const form = reactive({
  keyword: '',
  networks: ['Kad', 'Global'] as SearchType[],
  duration: '1d' as AutoSearchDuration
});

const creating = ref(false);

function toggleNetwork(network: SearchType) {
  form.networks = form.networks.includes(network)
    ? form.networks.filter(entry => entry !== network)
    : [...form.networks, network];
}

async function create() {
  if (!form.keyword.trim() || form.networks.length === 0) return;

  creating.value = true;
  try {
    const response = await api.createAutoSearch({
      keyword: form.keyword.trim(),
      networks: form.networks,
      duration: form.duration
    });

    if (!response.success || !response.data) {
      toast.add({ title: t('searchAuto.createFailed'), description: response.error, color: 'error' });
      return;
    }

    toast.add({ title: t('searchAuto.created', { keyword: response.data.search.keyword }), color: 'success' });
    form.keyword = '';
    selectedId.value = response.data.search.id;
    await refresh();
  } catch (e: any) {
    toast.add({ title: t('common.error'), description: e?.message, color: 'error' });
  } finally {
    creating.value = false;
  }
}

// ========== Acting on one ==========

async function stopOne(id: string) {
  const response = await api.stopAutoSearch(id).catch((e: any) => ({ success: false as const, error: e?.message, data: undefined }));
  if (!response.success) {
    toast.add({ title: t('common.error'), description: (response as any).error, color: 'error' });
    return;
  }
  toast.add({ title: t('searchAuto.stoppedToast'), color: 'warning' });
  await refresh();
}

async function resumeOne(id: string) {
  const response = await api.resumeAutoSearch(id).catch((e: any) => ({ success: false as const, error: e?.message, data: undefined }));
  if (!response.success) {
    toast.add({ title: t('common.error'), description: (response as any).error, color: 'error' });
    return;
  }
  toast.add({ title: t('searchAuto.resumedToast'), color: 'success' });
  await refresh();
}

async function removeOne(search: AutoSearchSummary) {
  const response = await api.deleteAutoSearch(search.id).catch((e: any) => ({ success: false as const, error: e?.message }));
  if (!response.success) {
    toast.add({ title: t('common.error'), description: (response as any).error, color: 'error' });
    return;
  }
  toast.add({ title: t('searchAuto.deletedToast', { keyword: search.keyword }), color: 'warning' });
  if (selectedId.value === search.id) {
    selectedId.value = null;
    selected.value = null;
  }
  await refresh();
}

// ========== Labels that move with the clock ==========

// A ticking "now", so "next pass in 3 min" counts down without a data poll
const now = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now(); }, 10 * 1000); });
onUnmounted(() => { if (clockTimer) clearInterval(clockTimer); });

function runningNow(search: AutoSearchSummary): boolean {
  // Heuristic: a pass takes up to ~90 seconds after it was due
  return search.nextRunAt <= now.value;
}

function nextPassLabel(search: AutoSearchSummary): string {
  const dueInMs = search.nextRunAt - now.value;
  if (dueInMs <= 0) return t('searchAuto.passRunning');

  const minutes = Math.max(1, Math.round(dueInMs / 60000));
  return t('searchAuto.nextPass', { minutes });
}

function statusColor(status: AutoSearchSummary['status']) {
  if (status === 'active') return 'primary' as const;
  if (status === 'finished') return 'success' as const;
  return 'neutral' as const;
}

</script>

