<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Shared Files</h1>
        <p class="text-gray-600 dark:text-gray-400">View active uploads and shared files</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Active Uploads ({{ shared?.length || 0 }})</h2>
      </template>

      <div v-if="loading" class="text-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">Loading shared files...</p>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-600" />
        <p class="mt-2 text-red-600">{{ error }}</p>
      </div>

      <div v-else-if="!shared || shared.length === 0" class="text-center py-8">
        <UIcon name="i-heroicons-folder-open" class="w-8 h-8 mx-auto text-gray-400" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">No active uploads</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="(upload, index) in shared"
          :key="index"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ upload.fileName }}</h3>
              
              <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">User</span>
                  <span class="font-medium">{{ upload.user }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Speed</span>
                  <span class="font-medium flex items-center gap-1">
                    <UIcon name="i-heroicons-arrow-up" class="w-3 h-3" />
                    {{ formatSpeed(upload.speed) }}
                  </span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Transferred</span>
                  <span class="font-medium">{{ formatBytes(upload.transferred) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

useHead({ title: 'Shared Files' })

const shared = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchShared() {
  loading.value = true
  error.value = null
  try {
    const result = await $fetch('/api/amule/shared')
    if (result.success) {
      shared.value = result.data || []
    } else {
      error.value = result.error || 'Failed to load shared files'
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load shared files'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchShared()
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

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`
  }
  return `${kbps.toFixed(2)} KB/s`
}

onMounted(() => {
  fetchShared()
})
</script>
