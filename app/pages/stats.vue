<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Statistics</h1>
        <p class="text-gray-600 dark:text-gray-400">View detailed transfer statistics</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <div v-if="loading" class="text-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
      <p class="mt-2 text-gray-600 dark:text-gray-400">Loading statistics...</p>
    </div>

    <div v-else-if="error" class="text-center py-8">
      <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-600" />
      <p class="mt-2 text-red-600">{{ error }}</p>
    </div>

    <div v-else-if="stats" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- General Stats -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold flex items-center gap-2">
            <UIcon name="i-heroicons-clock" />
            General
          </h3>
        </template>
        <dl class="space-y-2">
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Uptime</dt>
            <dd class="font-medium">{{ formatUptime(stats.uptime) }}</dd>
          </div>
        </dl>
      </UCard>

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
            <dt class="text-gray-600 dark:text-gray-400">Session</dt>
            <dd class="font-medium">{{ formatBytes(stats.sessionUploaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Total</dt>
            <dd class="font-medium">{{ formatBytes(stats.totalUploaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Rate</dt>
            <dd class="font-medium">{{ formatSpeed(stats.uploadRate) }}</dd>
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
            <dt class="text-gray-600 dark:text-gray-400">Session</dt>
            <dd class="font-medium">{{ formatBytes(stats.sessionDownloaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Total</dt>
            <dd class="font-medium">{{ formatBytes(stats.totalDownloaded) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Rate</dt>
            <dd class="font-medium">{{ formatSpeed(stats.downloadRate) }}</dd>
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
            <dt class="text-gray-600 dark:text-gray-400">Connected</dt>
            <dd class="font-medium">{{ stats.connectedClients }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Total</dt>
            <dd class="font-medium">{{ stats.totalClients }}</dd>
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
            <dd class="font-medium">{{ stats.sharedFiles }}</dd>
          </div>
        </dl>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

useHead({ title: 'Statistics' })

const stats = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchStats() {
  loading.value = true
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
  await fetchStats()
  refreshing.value = false
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }
  return `${bytes} B`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
  }
  if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(2)} KB/s`
  }
  return `${bytesPerSec} B/s`
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

onMounted(() => {
  fetchStats()
})
</script>
