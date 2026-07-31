<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">Uploads</h1>
        <p class="text-gray-600 dark:text-gray-400">What this daemon is currently sending, and to whom</p>
      </div>
      <div class="flex items-center gap-2">
        <USwitch v-model="autoRefresh" label="Auto refresh" />
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

    <!-- Loading is the default state until the first fetch resolves -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <USkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
      </div>
      <USkeleton v-for="n in 4" :key="`row-${n}`" class="h-16 w-full" />
      <p class="text-center text-sm text-gray-600 dark:text-gray-400">Loading uploads...</p>
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      title="Failed to load uploads"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <!-- Totals -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Clients uploading</div>
          <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="activeUploads.length" /></div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Total upload speed</div>
          <div class="text-2xl font-bold mt-1 text-green-600">
            <AnimatedValue :model-value="formatSpeed(totalSpeed)" />
          </div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Sent this session</div>
          <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="formatBytes(sessionTotal)" /></div>
        </div>
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Waiting in queue</div>
          <div class="text-2xl font-bold mt-1"><AnimatedValue :model-value="queuedUploads.length" /></div>
        </div>
      </div>

      <UEmpty
        v-if="uploads.length === 0"
        icon="i-heroicons-arrow-up-tray"
        title="No active uploads"
        description="Clients appear here while they download from you."
      />

      <UCard v-else>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-xl font-semibold">Transfers ({{ visibleUploads.length }})</h2>
            <ListControls
              v-model:search="search"
              v-model:sort-by="sortBy"
              v-model:direction="direction"
              :options="sortOptions"
              placeholder="Filter by file or user..."
              class="sm:max-w-md"
            />
          </div>
        </template>

        <UEmpty
          v-if="visibleUploads.length === 0"
          icon="i-heroicons-magnifying-glass"
          title="No matches"
          :description="`No upload matches '${search}'.`"
        />

        <TransitionGroup v-else name="list" tag="div" class="space-y-3 relative">
          <div
            v-for="upload in visibleUploads"
            :key="`${upload.fileHash}-${upload.userIp}-${upload.userPort}`"
            class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-default/40 backdrop-blur-sm"
          >
            <div class="min-w-0 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <p class="font-semibold truncate" :title="upload.fileName">{{ upload.fileName }}</p>
                <UBadge
                  :color="upload.speed > 0 ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  class="shrink-0"
                >
                  <AnimatedValue :model-value="upload.speed > 0 ? formatSpeed(upload.speed) : 'Idle'" />
                </UBadge>
              </div>

              <p
                v-if="upload.remoteFileName && upload.remoteFileName !== upload.fileName"
                class="text-xs text-gray-500 dark:text-gray-400 truncate"
                :title="upload.remoteFileName"
              >
                Requested as: {{ upload.remoteFileName }}
              </p>

              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">User</span>
                  <span class="font-medium truncate" :title="upload.user">{{ upload.user }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Address</span>
                  <span class="font-medium font-mono text-xs truncate">
                    {{ upload.userIp || '-' }}<span v-if="upload.userPort">:{{ upload.userPort }}</span>
                  </span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Client</span>
                  <span class="font-medium truncate">{{ upload.clientSoftware || 'Unknown' }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Session</span>
                  <span class="font-medium">{{ formatBytes(upload.transferred) }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">All time</span>
                  <span class="font-medium">{{ formatBytes(upload.transferredTotal) }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Queue / score</span>
                  <span class="font-medium">
                    {{ upload.waitingPosition > 0 ? `#${upload.waitingPosition}` : 'uploading' }}
                    <span class="text-gray-400">/ {{ upload.score }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Upload } from '../../server/utils/amule-types';
import { formatBytes, formatSpeed } from '#shared/utils/format';
import { filterItems, sortItems, type SortDirection, type SortOption } from '#shared/utils/sorting';

const api = useAmuleApi();

useHead({ title: 'Uploads' });

const uploads = ref<Upload[]>([]);
// Loading first: never show "no uploads" before the first fetch resolved
const loading = ref(true);
const error = ref<string | null>(null);
const refreshing = ref(false);
const autoRefresh = ref(true);
const search = ref('');
const sortBy = ref('speed');
const direction = ref<SortDirection>('desc');

const sortOptions: SortOption[] = [
  { label: 'Speed', value: 'speed', defaultDirection: 'desc' },
  { label: 'Sent this session', value: 'session', defaultDirection: 'desc' },
  { label: 'Sent all time', value: 'total', defaultDirection: 'desc' },
  { label: 'Queue position', value: 'queue', defaultDirection: 'asc' },
  { label: 'File name', value: 'file', defaultDirection: 'asc' },
  { label: 'User', value: 'user', defaultDirection: 'asc' }
];

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

const visibleUploads = computed(() => sortItems(
  filterItems(uploads.value, search.value, upload => [upload.fileName, upload.user, upload.userIp, upload.clientSoftware]),
  sortBy.value,
  direction.value,
  sortAccessors
));

async function fetchUploads({ silent = false }: { silent?: boolean } = {}) {
  if (!silent) loading.value = uploads.value.length === 0;
  error.value = null;

  try {
    const result = await api.getUploads();
    if (result.success) {
      uploads.value = result.data ?? [];
    } else {
      error.value = result.error || 'Failed to load uploads';
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load uploads';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await fetchUploads({ silent: true });
  refreshing.value = false;
}

let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  fetchUploads();
  timer = setInterval(() => {
    if (autoRefresh.value) fetchUploads({ silent: true });
  }, 3000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
