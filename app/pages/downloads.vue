<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Downloads</h1>
        <p class="text-gray-600 dark:text-gray-400">Manage your download queue</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <!-- Add Download -->

    <UForm :state="form" @submit="handleAdd">
      <UFormField label="Add New Download (eD2k or Magnet Link)" name="link">
        <div class="flex gap-2">
          <UInput
            v-model="form.link"
            placeholder="ed2k://|file|... or magnet:?xt=..."
            size="lg"
            class="flex-1"
            @keydown.enter="handleAdd"
          />
          <UButton type="submit" :loading="adding" size="lg" icon="i-heroicons-arrow-right" aria-label="Add Download" />
        </div>
      </UFormField>
    </UForm>

    <!-- Downloads Table -->


      <div v-if="loading" class="text-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">Loading downloads...</p>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-600" />
        <p class="mt-2 text-red-600">{{ error }}</p>
      </div>

      <div v-else-if="!downloads || downloads.length === 0" class="text-center py-8">
        <UIcon name="i-heroicons-inbox" class="w-8 h-8 mx-auto text-gray-400" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">No downloads found</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="download in downloads"
          :key="download.hash"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ download.name }}</h3>
              
              <div class="mt-2 space-y-2">
                <!-- Progress Bar -->
                <div>
                  <UProgress v-model="download.percentComplete" :min="0" :max="100" size="md">
                    <template #indicator>
                      <div class="text-xs text-right">
                        {{ download.percentComplete.toFixed(2) }}%
                      </div>
                    </template>
                  </UProgress>
                </div>

                <!-- Stats - Grid Layout -->
                <div class="grid grid-cols-[1fr_1fr_auto] lg:grid-cols-6 gap-3 text-sm items-end">
                  <div class="flex flex-col">
                    <span class="hidden lg:block text-gray-500 dark:text-gray-400 text-xs">Size</span>
                    <span class="font-medium" v-if="download.size > 0">{{ formatBytes(download.sizeDone) }} / {{ formatBytes(download.size) }}</span>
                    <span class="font-medium" v-else>{{ download.percentComplete.toFixed(2) }}%</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="hidden lg:block text-gray-500 dark:text-gray-400 text-xs">Speed</span>
                    <span class="font-medium flex items-center gap-1">
                      <UIcon name="i-heroicons-arrow-down" class="w-3 h-3" />
                      <span v-if="download.status === 'Paused'" class="text-gray-500 dark:text-gray-400">Paused</span>
                      <span v-else>{{ formatSpeed(download.speed) }}</span>
                    </span>
                  </div>
                  <!-- Hidden on mobile, shown on desktop -->
                  <div class="hidden lg:flex flex-col">
                    <span class="text-gray-500 dark:text-gray-400 text-xs">Sources</span>
                    <span class="font-medium flex items-center gap-1">
                      <UIcon name="i-heroicons-user-group" class="w-3 h-3" />
                      {{ download.sources }}
                    </span>
                  </div>
                  <div class="hidden lg:flex flex-col">
                    <span class="text-gray-500 dark:text-gray-400 text-xs">Status</span>
                    {{ download.status }}
                  </div>
                  <div class="hidden lg:flex flex-col">
                    <span class="text-gray-500 dark:text-gray-400 text-xs">Priority</span>
                    {{ download.priority }}
                  </div>
                  <!-- Actions on Desktop -->
                  <div class="hidden lg:flex gap-2 flex-row-reverse">
                    <UButton
                      v-if="download.status === 'Paused'"
                      icon="i-heroicons-play"
                      size="xs"
                      @click="handleResume(download)"
                      aria-label="Resume"
                    />
                    <UButton
                      v-else-if="download.status === 'Downloading'"
                      icon="i-heroicons-pause"
                      size="xs"
                      @click="handlePause(download)"
                      aria-label="Pause"
                    />
                    <UButton
                      icon="i-heroicons-x-mark"
                      size="xs"
                      color="error"
                      @click="handleCancel(download)"
                      aria-label="Cancel"
                    />
                  </div>
                  <!-- Actions - Mobile Only (Dropdown) -->
                  <div class="lg:hidden flex justify-end">
                    <UDropdownMenu :items="getActions(download)" :modal="false"">
                      <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" size="xs" />
                    </UDropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { ref, reactive, onMounted, onUnmounted } from 'vue'

const api = useAmuleApi();
const toast = useToast();

useHead({ title: 'Downloads' });

const downloads = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const refreshing = ref(false);
const adding = ref(false);

const form = reactive({
  link: ''
});

async function fetchDownloads(silent = false) {
  // Only show loading spinner if not a silent background refresh and no data exists
  if (!silent && downloads.value.length === 0) {
    loading.value = true;
  }
  error.value = null;
  try {
    const result = await api.getDownloads();
    if (result.success) {
      downloads.value = result.data || [];
    } else {
      error.value = result.error || 'Failed to load downloads';
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load downloads';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await fetchDownloads(false); // Manual refresh, show loading
  refreshing.value = false;
}

async function handleAdd() {
  if (!form.link.trim()) {
    toast.add({ title: 'Please enter a link', color: 'warning' });
    return;
  }

  adding.value = true;
  try {
    const result = await api.addDownload(form.link);
    if (result.success) {
      toast.add({ title: 'Download added successfully', color: 'success' });
      form.link = '';
      await fetchDownloads();
    } else {
      toast.add({ title: 'Failed to add download', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  } finally {
    adding.value = false;
  }
}

async function handlePause(download: any) {
  try {
    const result = await api.pauseDownload(download.hash);
    if (result.success) {
      toast.add({ title: 'Download paused', color: 'success' });
      await fetchDownloads();
    } else {
      toast.add({ title: 'Failed to pause', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  }
}

async function handleResume(download: any) {
  try {
    const result = await api.resumeDownload(download.hash);
    if (result.success) {
      toast.add({ title: 'Download resumed', color: 'success' });
      await fetchDownloads();
    } else {
      toast.add({ title: 'Failed to resume', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  }
}

async function handleCancel(download: any) {
  try {
    const result = await api.cancelDownload(download.hash);
    if (result.success) {
      toast.add({ title: 'Download cancelled', color: 'warning' });
      await fetchDownloads();
    } else {
      toast.add({ title: 'Failed to cancel', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  }
}

async function handleSetPriority(download: any, priority: string) {
  try {
    const result = await api.setPriority(download.hash, priority);
    if (result.success) {
      toast.add({ title: `Priority set to ${priority}`, color: 'success' });
      await fetchDownloads();
    } else {
      toast.add({ title: 'Failed to set priority', description: result.error, color: 'error' });
    }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' });
  }
}

function getActions(download: any): DropdownMenuItem[] {
  const isPaused = download.status === 'Paused';
  
  return [
    [
      {
        label: isPaused ? 'Resume' : 'Pause',
        icon: isPaused ? 'i-heroicons-play' : 'i-heroicons-pause',
        onSelect: () => isPaused ? handleResume(download) : handlePause(download)
      },
      {
        label: 'Cancel',
        icon: 'i-heroicons-x-mark',
        onSelect: () => handleCancel(download)
      }
    ],
    [
      {
        label: 'Priority',
        icon: 'i-heroicons-arrow-up',
        children: [
          { label: 'Auto', onSelect: () => handleSetPriority(download, 'Auto') },
          { label: 'High', onSelect: () => handleSetPriority(download, 'High') },
          { label: 'Normal', onSelect: () => handleSetPriority(download, 'Normal') },
          { label: 'Low', onSelect: () => handleSetPriority(download, 'Low') }
        ]
      },
      {
        label: 'Info',
        icon: 'i-heroicons-information-circle',
        children: [
          { label: `Sources: ${download.sources}`, disabled: true },
          { label: `Status: ${download.status}`, disabled: true },
          { label: `Priority: ${download.priority}`, disabled: true }
        ]
      }
    ]
  ];
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Downloading': return 'blue';
    case 'Paused': return 'orange';
    case 'Complete': return 'green';
    case 'Error': return 'red';
    default: return 'gray';
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`;
  }
  return `${kbps.toFixed(2)} KB/s`;
}

// Initial fetch and auto-refresh setup
let interval: ReturnType<typeof setInterval>;
onMounted(() => {
  fetchDownloads(); // Initial load
  
  // Auto-refresh every 5 seconds (silent mode - no loading spinner)
  interval = setInterval(() => fetchDownloads(true), 5000);
});

onUnmounted(() => {
  if (interval) clearInterval(interval);
});
</script>
