<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold mb-2">Dashboard - Amule Nuxt</h1>
      <p class="text-gray-600 dark:text-gray-400">Overview of your aMule daemon status and activity</p>
    </div>

    <!-- Connection Status Indicator (WebSocket) -->
    <div v-if="!wsStatus.connected" class="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg flex items-center justify-between">
      <div class="flex items-center gap-2">
         <UIcon name="i-heroicons-wifi" class="w-5 h-5 animate-pulse" />
         <span>Connecting to real-time updates...</span>
      </div>
      <div v-if="wsStatus.error" class="text-sm">
         {{ wsStatus.error }}
      </div>
    </div>


    <!-- Current downloads summary -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-xl font-semibold">Current downloads</h2>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UBadge color="neutral" variant="subtle">
              <AnimatedValue :model-value="downloadItems.length" /> in queue
            </UBadge>
            <UBadge v-if="activeCount" color="success" variant="subtle">{{ activeCount }} downloading</UBadge>
            <UBadge v-if="searchingCount" color="info" variant="subtle">{{ searchingCount }} searching</UBadge>
            <span v-if="totalSpeed > 0" class="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <UIcon name="i-heroicons-arrow-down" class="w-4 h-4" />
              {{ formatSpeed(totalSpeed) }}
            </span>
          </div>
        </div>
      </template>

      <!-- Loading first, never an empty list before the queue is known -->
      <SmoothSwap>
      <div v-if="downloadsLoading" key="loading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="space-y-2">
          <USkeleton class="h-4 w-2/3" />
          <USkeleton class="h-2 w-full" />
        </div>
      </div>

      <UAlert
        v-else-if="downloadsError"
        key="error"
        color="error"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        title="Failed to load downloads"
        :description="downloadsError"
      />

      <UEmpty
        v-else-if="downloadItems.length === 0"
        key="empty"
        icon="i-heroicons-inbox"
        title="Nothing downloading"
        description="Paste an eD2k or magnet link above to get started."
      />

      <TransitionGroup v-else key="rows" name="list" tag="div" class="space-y-3 relative">
        <NuxtLink
          v-for="download in summaryDownloads"
          :key="download.hash"
          to="/downloads"
          class="block rounded-lg p-2 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-sm font-medium truncate" :title="download.name">{{ download.name }}</span>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatSpeed(download.speed) }}</span>
              <UBadge :color="downloadHealth(download).color" variant="subtle" size="sm">
                {{ downloadHealth(download).label }}
              </UBadge>
            </div>
          </div>
          <UProgress :model-value="download.percentComplete" :min="0" :max="100" size="sm" />
        </NuxtLink>
      </TransitionGroup>
      </SmoothSwap>

      <!-- Always reachable, whatever the queue looks like -->
      <template #footer>
        <UButton
          to="/downloads"
          variant="outline"
          size="sm"
          block
          trailing-icon="i-heroicons-arrow-right"
        >
          {{ downloadItems.length > summaryDownloads.length
            ? `See all ${downloadItems.length} downloads`
            : 'Manage downloads' }}
        </UButton>
      </template>
    </UCard>

    <!-- Quick Statistics -->
      <div class="grid grid-cols-4 gap-2 md:gap-4">
        <!-- Speeds link to the page that explains them -->
        <NuxtLink
          to="/uploads"
          class="p-2 md:p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex flex-col items-center md:items-start justify-center hover:bg-elevated/80 transition-colors"
          title="Show the clients being uploaded to"
        >
          <div class="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-arrow-up" class="w-5 h-5 md:w-4 md:h-4" />
            <span class="hidden md:inline">Upload speed</span>
          </div>
          <div class="text-sm md:text-2xl font-bold mt-1 md:mt-2 text-green-600 text-center md:text-left">
            <USkeleton v-if="statusLoading" class="h-4 md:h-8 w-12 md:w-24" />
            <template v-else><AnimatedValue :model-value="formatSpeed(effectiveStatus?.uploadSpeed || 0)" /></template>
          </div>
        </NuxtLink>

        <NuxtLink
          to="/downloads"
          class="p-2 md:p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex flex-col items-center md:items-start justify-center hover:bg-elevated/80 transition-colors"
          title="Show the download queue"
        >
          <div class="flex items-center gap-1 md:gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-arrow-down" class="w-5 h-5 md:w-4 md:h-4" />
            <span class="hidden md:inline">Download speed</span>
          </div>
          <div class="text-sm md:text-2xl font-bold mt-1 md:mt-2 text-blue-600 text-center md:text-left">
            <USkeleton v-if="statusLoading" class="h-4 md:h-8 w-12 md:w-24" />
            <template v-else><AnimatedValue :model-value="formatSpeed(effectiveStatus?.downloadSpeed || 0)" /></template>
          </div>
        </NuxtLink>

        <NuxtLink
          to="/uploads"
          class="p-2 md:p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex flex-col items-center md:items-start justify-center hover:bg-elevated/80 transition-colors"
          title="Clients waiting in the upload queue"
        >
          <div class="flex items-center gap-1 md:gap-2 text-[10px] md:text-sm text-gray-600 dark:text-gray-400 text-center md:text-left">
            <UIcon name="i-heroicons-users" class="w-4 h-4 hidden md:block" />
            <span class="leading-tight">Queued<br class="md:hidden" /> clients</span>
          </div>
          <div class="text-sm md:text-2xl font-bold mt-1 md:mt-2 text-center md:text-left">
            <USkeleton v-if="statusLoading" class="h-4 md:h-8 w-8 md:w-16" />
            <template v-else><AnimatedValue :model-value="effectiveStatus?.queuedClients ?? 0" /></template>
          </div>
        </NuxtLink>

        <NuxtLink
          to="/downloads"
          class="p-2 md:p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex flex-col items-center md:items-start justify-center hover:bg-elevated/80 transition-colors"
          title="Sources found for the download queue"
        >
          <div class="flex items-center gap-1 md:gap-2 text-[10px] md:text-sm text-gray-600 dark:text-gray-400 text-center md:text-left">
            <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 hidden md:block" />
            <span class="leading-tight">Total<br class="md:hidden" /> sources</span>
          </div>
          <div class="text-sm md:text-2xl font-bold mt-1 md:mt-2 text-center md:text-left">
            <USkeleton v-if="statusLoading" class="h-4 md:h-8 w-8 md:w-16" />
            <template v-else><AnimatedValue :model-value="effectiveStatus?.totalSourceCount ?? 0" /></template>
          </div>
        </NuxtLink>
      </div>

    <!-- Add a download straight from the dashboard -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Add download</h2>
          <UButton to="/downloads" variant="link" trailing-icon="i-heroicons-arrow-right" size="sm">
            Open queue
          </UButton>
        </div>
      </template>

      <AddLinkForm label="eD2k or magnet link" multiline />
    </UCard>
    
    
    <!-- Connection Management -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">Connection</h2>
          <div class="flex gap-2">
            <UButton
              @click="handleConnect"
              :loading="connecting"
              :disabled="statusLoading || bothNetworksConnected"
              color="success"
              icon="i-heroicons-link"
            >
              Connect
            </UButton>
            <UButton
              @click="handleDisconnect"
              :loading="disconnecting"
              :disabled="statusLoading || !anyNetworkConnected"
              color="error"
              variant="outline"
              icon="i-heroicons-link-slash"
            >
              Disconnect
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex justify-between md:block">
          <div class="text-sm text-gray-600 dark:text-gray-400">eD2k
            
            <span v-if="effectiveStatus?.serverName" class="text-xs text-gray-600 dark:text-gray-400 mt-1">
              ({{ effectiveStatus.serverName }})
            </span>
          </div>
          <div class="text-lg font-semibold mt-1">
            <USkeleton v-if="statusLoading" class="h-6 w-28" />
            <UBadge v-else :color="effectiveStatus?.ed2kConnected ? 'success' : 'neutral'">
              {{ effectiveStatus?.ed2kConnected ? 'Connected' : (effectiveStatus?.ed2kConnecting ? 'Connecting...' : 'Disconnected') }}
            </UBadge>
          </div>
        </div>

        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex justify-between md:block">
          <div class="text-sm text-gray-600 dark:text-gray-400">Kad</div>
          <div class="text-lg font-semibold mt-1">
            <USkeleton v-if="statusLoading" class="h-6 w-28" />
            <UBadge v-else :color="effectiveStatus?.kadConnected ? 'success' : 'neutral'">
              {{ effectiveStatus?.kadConnected ? 'Connected' : 'Disconnected' }}
            </UBadge>
          </div>
        </div>

        <div class="p-4 bg-elevated/50 backdrop-blur-sm rounded-lg flex justify-between md:block">
          <div class="text-sm text-gray-600 dark:text-gray-400">Client ID</div>
          <div class="text-lg font-semibold mt-1 font-mono">
            <USkeleton v-if="statusLoading" class="h-6 w-32" />
            <template v-else>{{ effectiveStatus?.id || 'N/A' }}</template>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Quick Actions -->
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Quick Actions</h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NuxtLink to="/downloads">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-arrow-down-tray" class="w-5 h-5" />
            </template>
            Manage Downloads
          </UButton>
        </NuxtLink>

        <NuxtLink to="/search">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5" />
            </template>
            Search Files
          </UButton>
        </NuxtLink>

        <NuxtLink to="/settings">
          <UButton block size="lg" variant="outline">
            <template #leading>
              <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5" />
            </template>
            Settings
          </UButton>
        </NuxtLink>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAmuleSocket } from '~/composables/useAmuleSocket';
import { classifyDownload } from '#shared/utils/downloadHealth';
import { formatSpeed } from '#shared/utils/format';

const api = useAmuleApi();
const toast = useToast();
const { status, settled: statusSettled, fetchStatus } = useAmuleStatus(); // Keep fallback to polling if WS fails initially?
const { wsStatus, realtimeStatus } = useAmuleSocket();

// Prioritize real-time status if available
const effectiveStatus = computed(() => {
  if (wsStatus.value.connected && realtimeStatus.value) {
    return realtimeStatus.value;
  }
  return status.value;
});

// Loading only until the first attempt resolved: once it failed, the tiles show
// the disconnected state instead of skeletons that would spin forever.
const statusLoading = computed(() => !effectiveStatus.value && !statusSettled.value);
const anyNetworkConnected = computed(() =>
  Boolean(effectiveStatus.value?.ed2kConnected || effectiveStatus.value?.kadConnected)
);
const bothNetworksConnected = computed(() =>
  Boolean(effectiveStatus.value?.ed2kConnected && effectiveStatus.value?.kadConnected)
);

const {
  items: downloadItems,
  loading: downloadsLoading,
  error: downloadsError,
  activeCount,
  searchingCount,
  totalSpeed,
  startPolling
} = useDownloads();

startPolling();

// Busiest entries first: what the user most likely wants to see at a glance
const summaryDownloads = computed(() =>
  [...downloadItems.value]
    .sort((a, b) => (b.speed || 0) - (a.speed || 0) || (b.percentComplete || 0) - (a.percentComplete || 0))
    .slice(0, 5)
);

const downloadHealth = (download: any) => classifyDownload(download);

const connecting = ref(false);
const disconnecting = ref(false);

useHead({ title: 'Dashboard' });

async function handleConnect() {
  connecting.value = true;
  try {
    const result = await api.connect();
    if (result.success) {
      toast.add({ title: result.message || 'Connecting...', color: 'success' });
      await fetchStatus();
    } else {
      toast.add({ title: 'Connection failed', description: result.error, color: 'error' });
    }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.message, color: 'error' });
  } finally {
    connecting.value = false;
  }
}

async function handleDisconnect() {
  disconnecting.value = true;
  try {
    const result = await api.disconnect();
    if (result.success) {
      toast.add({ title: result.message || 'Disconnected', color: 'warning' });
      await fetchStatus();
    } else {
      toast.add({ title: 'Disconnect failed', description: result.error, color: 'error' });
    }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.message, color: 'error' });
  } finally {
    disconnecting.value = false;
  }
}

</script>
