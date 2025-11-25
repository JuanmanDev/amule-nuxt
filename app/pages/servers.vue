<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold mb-2">Servers</h1>
        <p class="text-gray-600 dark:text-gray-400">Manage eD2k server list</p>
      </div>
      <UButton @click="refresh" :loading="refreshing" icon="i-heroicons-arrow-path">
        Refresh
      </UButton>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Server List ({{ servers?.length || 0 }})</h2>
      </template>

      <div v-if="loading" class="text-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">Loading servers...</p>
      </div>

      <div v-else-if="error" class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 mx-auto text-red-600" />
        <p class="mt-2 text-red-600">{{ error }}</p>
      </div>

      <div v-else-if="!servers || servers.length === 0" class="text-center py-8">
        <UIcon name="i-heroicons-server-stack" class="w-8 h-8 mx-auto text-gray-400" />
        <p class="mt-2 text-gray-600 dark:text-gray-400">No servers found</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="server in servers"
          :key="server.ip + ':' + server.port"
          class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ server.name }}</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 truncate">{{ server.description }}</p>
              
              <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Address</span>
                  <span class="font-medium">{{ server.ip }}:{{ server.port }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Users</span>
                  <span class="font-medium">{{ server.users.toLocaleString() }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Files</span>
                  <span class="font-medium">{{ server.files.toLocaleString() }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Priority</span>
                  <UBadge variant="outline" size="xs">{{ server.priority }}</UBadge>
                </div>
                <div class="flex flex-col">
                  <span class="text-gray-500 dark:text-gray-400 text-xs">Status</span>
                  <UBadge :color="server.failed > 0 ? 'red' : 'green'" size="xs">
                    {{ server.failed > 0 ? 'Failed' : 'Active' }}
                  </UBadge>
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

useHead({ title: 'Servers' })

const servers = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchServers() {
  loading.value = true
  error.value = null
  try {
    const result = await $fetch('/api/amule/servers')
    if (result.success) {
      servers.value = result.data || []
    } else {
      error.value = result.error || 'Failed to load servers'
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to load servers'
  } finally {
    loading.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await fetchServers()
  refreshing.value = false
}

onMounted(() => {
  fetchServers()
})
</script>
