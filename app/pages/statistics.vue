<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">Statistics</h1>
        <p class="text-gray-600 dark:text-gray-400">
          Transfer history, session and all-time totals, and the full statistics tree aMule maintains
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton to="/stats" variant="link" size="sm" trailing-icon="i-heroicons-arrow-right">
          Summary
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

    <!-- Live rates, with history sampled by the server so it is not empty on load -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-semibold">Transfer rate</h2>
          <div class="flex flex-wrap items-center gap-2">
            <NuxtLink
              to="/uploads"
              class="flex items-center gap-1 text-sm font-medium text-green-600 hover:underline"
              title="Show the clients being uploaded to"
            >
              <UIcon name="i-heroicons-arrow-up" class="w-4 h-4" />
              <AnimatedValue :model-value="formatSpeed(currentUpload)" />
            </NuxtLink>
            <NuxtLink
              to="/downloads"
              class="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
              title="Show the download queue"
            >
              <UIcon name="i-heroicons-arrow-down" class="w-4 h-4" />
              <AnimatedValue :model-value="formatSpeed(currentDownload)" />
            </NuxtLink>
            <USelect v-model="windowMinutes" :items="windowOptions" value-key="value" class="w-28" />
          </div>
        </div>
      </template>

      <div v-if="historyLoading && samples.length === 0" class="space-y-2">
        <USkeleton class="h-40 w-full" />
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">Collecting samples...</p>
      </div>

      <UEmpty
        v-else-if="samples.length < 2"
        icon="i-heroicons-chart-bar"
        title="Not enough samples yet"
        description="The server samples the transfer rate every two seconds; the chart appears within a few seconds."
      />

      <SpeedChart v-else :samples="samples" :minutes-span="windowMinutes" />

      <template #footer>
        <!-- aMule tracks these itself since the daemon started, so they show real
             numbers even when this server only just began sampling -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Max upload (session)</div>
            <div class="font-medium">{{ figures.maxUpload ?? formatSpeed(history?.peakUpload ?? 0) }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Max download (session)</div>
            <div class="font-medium">{{ figures.maxDownload ?? formatSpeed(history?.peakDownload ?? 0) }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Average upload (session)</div>
            <div class="font-medium">{{ figures.averageUpload ?? formatSpeed(history?.averageUpload ?? 0) }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Average download (session)</div>
            <div class="font-medium">{{ figures.averageDownload ?? formatSpeed(history?.averageDownload ?? 0) }}</div>
          </div>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Peak in the shown window: {{ formatSpeed(history?.peakUpload ?? 0) }} up,
          {{ formatSpeed(history?.peakDownload ?? 0) }} down
          &middot; daemon uptime {{ figures.uptime ?? 'unknown' }}
        </p>
      </template>
    </UCard>

    <!-- Session next to all-time, both straight from aMule -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Transferred data</h2>
      </template>

      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div v-for="row in transferRows" :key="row.label" class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <UIcon :name="row.icon" class="w-4 h-4" />
            {{ row.label }}
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-2xl font-bold" :class="row.class">{{ row.total }}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">all time</span>
          </div>
          <div class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {{ row.session }} <span class="text-xs">this session</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div v-for="detail in transferDetails" :key="detail.label">
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ detail.label }}</div>
            <div class="font-medium">{{ detail.value }}</div>
          </div>
        </div>
        <!-- The two all-time upload figures in this app come from different books
             and are expected to differ; saying so beats looking like a bug -->
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
          These are aMule's own counters, reset whenever its statistics are.
          <NuxtLink to="/shared" class="underline">Shared files</NuxtLink>
          adds up each file's own all-time counter instead, which is usually higher.
        </p>
      </template>
    </UCard>

    <!-- Totals and network figures -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="metric in metrics" :key="metric.label" class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <UIcon :name="metric.icon" class="w-4 h-4" />
          {{ metric.label }}
        </div>
        <component
          :is="metric.to ? 'NuxtLink' : 'div'"
          :to="metric.to"
          class="text-2xl font-bold mt-1 block"
          :class="metric.to ? 'hover:underline' : ''"
        >
          <USkeleton v-if="statsLoading" class="h-7 w-24" />
          <template v-else>{{ metric.value }}</template>
        </component>
        <div v-if="metric.hint" class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ metric.hint }}</div>
      </div>
    </div>

    <!-- Statistics tree -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">aMule statistics tree</h2>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <UInput
              v-model="search"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter entries..."
              class="flex-1 sm:w-56"
              :ui="{ trailing: 'pe-1' }"
            >
              <template v-if="search" #trailing>
                <UButton
                  icon="i-heroicons-x-mark"
                  variant="link"
                  color="neutral"
                  size="xs"
                  aria-label="Clear filter"
                  @click="() => { search = '' }"
                />
              </template>
            </UInput>
          </div>
        </div>
      </template>

      <!-- Loading is the default state until the first fetch resolves -->
      <div v-if="loading" class="space-y-2">
        <USkeleton v-for="n in 10" :key="n" class="h-4" :class="n % 3 === 0 ? 'w-1/2' : 'w-3/4'" />
        <p class="pt-2 text-center text-sm text-gray-600 dark:text-gray-400">Loading statistics...</p>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        title="Failed to load statistics"
        :description="error"
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <UEmpty
        v-else-if="!tree"
        icon="i-heroicons-chart-bar"
        title="No statistics available"
        description="The daemon returned an empty statistics tree."
      />

      <!-- Filtering flattens the tree to matching lines, which is what you want when searching -->
      <div v-else-if="search.trim()" class="space-y-1">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ matches.length }} matching entries</p>
        <UEmpty
          v-if="matches.length === 0"
          icon="i-heroicons-magnifying-glass"
          title="No matches"
          :description="`No statistics entry matches '${search}'.`"
        />
        <TransitionGroup v-else tag="ul" name="list" class="space-y-0.5 relative">
          <li v-for="(line, index) in matches" :key="`${index}::${line.path}::${line.label}`" class="text-sm break-words">
            <span class="text-gray-400 text-xs">{{ line.path }} / </span>{{ line.label }}
          </li>
        </TransitionGroup>
      </div>

      <ul v-else class="space-y-0.5">
        <StatsTreeNode :node="tree" />
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { Statistics } from '../../server/utils/amule-types';
import type { StatsTreeNode as StatsTreeNodeType } from '../../server/utils/amule-ec/statsTree';
import { formatBytes, formatSpeed } from '#shared/utils/format';
import { readAmuleFigures } from '#shared/utils/statsFigures';

const api = useAmuleApi();

useHead({ title: 'Statistics' });

const tree = ref<StatsTreeNodeType | null>(null);
const stats = ref<Statistics | null>(null);
const history = ref<{
  samples: Array<{ at: number; upload: number; download: number }>;
  peakUpload: number;
  peakDownload: number;
  averageUpload: number;
  averageDownload: number;
} | null>(null);

const loading = ref(true);
const historyLoading = ref(true);
const error = ref<string | null>(null);
const refreshing = ref(false);
const search = ref('');
const windowMinutes = ref(5);

const windowOptions = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 }
];

const statsLoading = computed(() => stats.value === null);

/** Session and all-time figures aMule reports in its own statistics tree. */
const figures = computed(() => readAmuleFigures(tree.value));

const transferRows = computed(() => [
  {
    label: 'Uploaded',
    icon: 'i-heroicons-arrow-up-tray',
    class: 'text-green-600',
    total: figures.value.uploaded?.total ?? figures.value.uploaded?.session ?? formatBytes(stats.value?.totalUploaded ?? 0),
    session: figures.value.uploaded?.session ?? '-'
  },
  {
    label: 'Downloaded',
    icon: 'i-heroicons-arrow-down-tray',
    class: 'text-blue-600',
    total: figures.value.downloaded?.total ?? figures.value.downloaded?.session ?? formatBytes(stats.value?.totalDownloaded ?? 0),
    session: figures.value.downloaded?.session ?? '-'
  },
  {
    label: 'Upload / download ratio',
    icon: 'i-heroicons-scale',
    class: '',
    total: figures.value.ratio?.total ?? 'n/a',
    session: figures.value.ratio?.session ?? '-'
  }
]);

const transferDetails = computed(() => [
  { label: 'Active uploads', value: figures.value.activeUploads ?? '-' },
  { label: 'Waiting uploads', value: figures.value.waitingUploads ?? '-' },
  { label: 'Upload sessions', value: figures.value.uploadSessions ?? '-' },
  { label: 'Average upload time', value: figures.value.averageUploadTime ?? '-' },
  { label: 'Active downloads', value: figures.value.activeDownloads ?? '-' },
  { label: 'Sources found', value: figures.value.foundSources ?? '-' },
  { label: 'Connections now / peak', value: (figures.value.activeConnections ?? '-') + ' / ' + (figures.value.peakConnections ?? '-') },
  { label: 'Reconnects', value: figures.value.reconnects ?? '-' }
]);
const samples = computed(() => history.value?.samples ?? []);
const currentUpload = computed(() => samples.value.at(-1)?.upload ?? 0);
const currentDownload = computed(() => samples.value.at(-1)?.download ?? 0);

const metrics = computed(() => [
  {
    label: 'Shared files',
    icon: 'i-heroicons-folder-open',
    value: figures.value.sharedFiles ?? (stats.value?.sharedFiles ?? 0).toLocaleString(),
    hint: figures.value.sharedSize ? figures.value.sharedSize + ' total' : undefined,
    to: '/shared'
  },
  {
    label: 'Average shared file',
    icon: 'i-heroicons-document',
    value: figures.value.averageFileSize ?? '-',
    to: '/shared'
  },
  {
    label: 'Clients in upload queue',
    icon: 'i-heroicons-user-group',
    value: (stats.value?.queuedClients ?? 0).toLocaleString(),
    to: '/uploads'
  },
  {
    label: 'Sources found',
    icon: 'i-heroicons-magnifying-glass',
    value: (stats.value?.totalSourceCount ?? 0).toLocaleString(),
    to: '/downloads'
  },
  {
    label: 'Servers',
    icon: 'i-heroicons-server-stack',
    value: figures.value.workingServers ? figures.value.workingServers + ' working' : '-',
    hint: figures.value.totalServers ? figures.value.totalServers + ' known' : undefined,
    to: '/servers'
  },
  {
    label: 'Clients filtered / banned',
    icon: 'i-heroicons-shield-exclamation',
    value: (figures.value.filteredClients ?? '-') + ' / ' + (figures.value.bannedClients ?? '-')
  },
  {
    label: 'eD2k network',
    icon: 'i-heroicons-globe-alt',
    value: (stats.value?.ed2kUsers ?? 0).toLocaleString() + ' users',
    hint: (stats.value?.ed2kFiles ?? 0).toLocaleString() + ' files',
    to: '/servers'
  },
  {
    label: 'Kad network',
    icon: 'i-heroicons-share',
    value: (stats.value?.kadUsers ?? 0).toLocaleString() + ' users',
    hint: (stats.value?.kadFiles ?? 0).toLocaleString() + ' files',
    to: '/connection'
  }
]);

/** Flattens the tree to "path / label" lines while filtering. */
const matches = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query || !tree.value) return [];

  const found: Array<{ path: string; label: string }> = [];
  const walk = (node: StatsTreeNodeType, path: string[]) => {
    if (node.label.toLowerCase().includes(query)) {
      found.push({ path: path.join(' / ') || 'Statistics', label: node.label });
    }
    node.children.forEach(child => walk(child, [...path, node.label]));
  };

  walk(tree.value, []);
  return found.slice(0, 200);
});

async function fetchTree({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) loading.value = !tree.value;
  error.value = null;

  try {
    const [treeResult, statsResult] = await Promise.all([api.getStatsTree(), api.getStatistics()]);

    if (treeResult.success) {
      tree.value = treeResult.data ?? null;
    } else {
      error.value = treeResult.error || 'Failed to load statistics';
    }

    if (statsResult.success) stats.value = statsResult.data ?? null;
  } catch (e: any) {
    error.value = e.message || 'Failed to load statistics';
  } finally {
    loading.value = false;
  }
}

async function fetchHistory() {
  try {
    const result = await api.getSpeedHistory(windowMinutes.value);
    if (result.success && result.data) history.value = result.data;
  } catch {
    // Keep the previous history when a poll fails
  } finally {
    historyLoading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await Promise.all([fetchTree({ silent: true }), fetchHistory()]);
  refreshing.value = false;
}

watch(windowMinutes, fetchHistory);

let treeTimer: ReturnType<typeof setInterval>;
let historyTimer: ReturnType<typeof setInterval>;

onMounted(() => {
  fetchTree();
  fetchHistory();
  treeTimer = setInterval(() => fetchTree({ silent: true }), 15_000);
  historyTimer = setInterval(fetchHistory, 2000);
});

onUnmounted(() => {
  if (treeTimer) clearInterval(treeTimer);
  if (historyTimer) clearInterval(historyTimer);
});
</script>
