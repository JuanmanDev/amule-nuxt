<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">aMule Logs</h1>
        <p class="text-gray-600 dark:text-gray-400">View daemon activity logs</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <div v-if="loading" class="text-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
      <p class="mt-2 text-gray-600 dark:text-gray-400">Loading logs...</p>
    </div>

    <div v-else-if="error" class="text-center py-8">
      <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-600" />
      <p class="mt-2 text-red-600">{{ error }}</p>
    </div>

    <div v-else-if="!logs || logs.length === 0" class="text-center py-8">
      <UIcon name="i-heroicons-document-text" class="w-8 h-8 mx-auto text-gray-400" />
      <p class="mt-2 text-gray-600 dark:text-gray-400">No logs available</p>
    </div>

    <div v-else class="space-y-1 font-mono text-sm max-h-dvh overflow-y-auto">
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="p-1 hover:bg-gray-50 dark:hover:bg-gray-800 rounded"
        :class="{ 'bg-red-50 dark:bg-red-800': log.startsWith('> !') }"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

useHead({ title: 'Logs' })

const logs = ref<string[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchLogs() {
  loading.value = true
  error.value = null
  try {
    const result = await $fetch('/api/amule/logs')
    if (result.success) {
      logs.value = result.data || []
    } else {
      error.value = result.error || 'Failed to load logs'
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load logs'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchLogs()
  refreshing.value = false
}

onMounted(() => {
  fetchLogs()
})
</script>
