<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Statistics</h1>
        <p class="text-gray-600 dark:text-gray-400">View detailed transfer statistics</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" :disabled="loading" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <!-- Loading is the default state until the first fetch resolves -->
    <SmoothSwap>
    <div v-if="loading" key="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <UCard v-for="n in 4" :key="n">
        <template #header>
          <USkeleton class="h-6 w-32" />
        </template>
        <div class="space-y-3">
          <USkeleton v-for="row in 3" :key="row" class="h-5 w-full" />
        </div>
      </UCard>
    </div>

    <UAlert
      v-else-if="error"
        key="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      title="Failed to load statistics"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <div v-else-if="stats" key="stats" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Upload Stats -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-up-tray" />
            Uploads
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <!-- aMule's own all-time counter, not the sum of the shared files'
                 counters shown on /shared: the two differ after a stats reset -->
            <dt class="text-gray-600 dark:text-gray-400" title="aMule's own all-time counter">
              Total (daemon counter)
            </dt>
            <dd class="font-medium">{{ formatBytes(stats.totalUploaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Rate</dt>
            <dd class="font-medium">{{ formatBytesPerSecond(stats.uploadRate) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Limit</dt>
            <dd class="font-medium">{{ stats.uploadLimit ? formatBytesPerSecond(stats.uploadLimit) : 'Unlimited' }}</dd>
          </div>
        </dl>
      </UCard>

      <!-- Download Stats -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-arrow-down-tray" />
            Downloads
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Total</dt>
            <dd class="font-medium">{{ formatBytes(stats.totalDownloaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Rate</dt>
            <dd class="font-medium">{{ formatBytesPerSecond(stats.downloadRate) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Limit</dt>
            <dd class="font-medium">{{ stats.downloadLimit ? formatBytesPerSecond(stats.downloadLimit) : 'Unlimited' }}</dd>
          </div>
        </dl>
      </UCard>

      <!-- Client Stats -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-user-group" />
            Clients
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Upload queue</dt>
            <dd class="font-medium">{{ stats.queuedClients.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Sources found</dt>
            <dd class="font-medium">{{ stats.totalSourceCount.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Banned</dt>
            <dd class="font-medium">{{ stats.bannedClients.toLocaleString() }}</dd>
          </div>
        </dl>
      </UCard>

      <!-- Shared Files -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-folder-open" />
            Shared Files
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Count</dt>
            <dd class="font-medium">{{ stats.sharedFiles.toLocaleString() }}</dd>
          </div>
        </dl>
      </UCard>

      <!-- eD2k Network -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-globe-alt" />
            eD2k Network
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Users</dt>
            <dd class="font-medium">{{ stats.ed2kUsers.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Files</dt>
            <dd class="font-medium">{{ stats.ed2kFiles.toLocaleString() }}</dd>
          </div>
        </dl>
      </UCard>

      <!-- Kad Network -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-share" />
            Kad Network
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Users</dt>
            <dd class="font-medium">{{ stats.kadUsers.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Files</dt>
            <dd class="font-medium">{{ stats.kadFiles.toLocaleString() }}</dd>
          </div>
        </dl>
      </UCard>
    </div>
    </SmoothSwap>

    <RelatedPages :pages="['statistics', 'connection', 'servers']" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { formatBytes, formatBytesPerSecond } from '#shared/utils/format'

useHead({ title: 'Statistics' })

const stats = ref<any>(null)
// Start in the loading state so the first paint never shows empty cards
const loading = ref(true)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchStats(silent = false) {
  if (!silent) loading.value = true
  error.value = null
  try {
    const result = await $fetch('/api/amule/statistics')
    if (result.success) {
      stats.value = result.data
    } else {
      error.value = result.error || 'Failed to load statistics'
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load statistics'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchStats(true)
  refreshing.value = false
}



onMounted(() => {
  fetchStats()
})
</script>
