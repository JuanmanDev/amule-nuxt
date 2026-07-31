<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">aMule logs</h1>
        <p class="text-gray-600 dark:text-gray-400">View daemon activity logs</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
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

    <ListControls
      v-if="!loading && !error && logs.length > 0"
      v-model:search="filter"
      v-model:sort-by="sortBy"
      v-model:direction="direction"
      :options="sortOptions"
      placeholder="Filter log lines..."
      class="sm:max-w-md"
    />

    <!-- Loading is the default state until the first fetch resolves -->
    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="n in 12" :key="n" class="h-4" :class="n % 3 === 0 ? 'w-2/3' : 'w-full'" />
      <p class="pt-2 text-center text-sm text-gray-600 dark:text-gray-400">Loading logs...</p>
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      title="Failed to load logs"
      :description="error"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="logs.length === 0"
      icon="i-heroicons-document-text"
      title="No logs available"
      description="The aMule daemon has not logged anything yet."
    />

    <UEmpty
      v-else-if="visibleLogs.length === 0"
      icon="i-heroicons-magnifying-glass"
      title="No matching lines"
      :description="`No log line matches '${filter}'.`"
    />

    <div v-else class="space-y-2">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Showing <AnimatedValue :model-value="visibleLogs.length" /> of
        <AnimatedValue :model-value="logs.length" /> lines
      </p>
      <!-- Lines aMule marks with a leading '!' are warnings or errors -->
      <TransitionGroup
        tag="div"
        name="list"
        class="font-mono text-xs sm:text-sm rounded-lg border border-gray-200 dark:border-gray-800 max-h-[70vh] overflow-auto divide-y divide-gray-100 dark:divide-gray-800 bg-default/40 backdrop-blur-sm"
      >
        <div
          v-for="(log, index) in visibleLogs"
          :key="`${index}::${log}`"
          class="px-3 py-1.5 whitespace-pre-wrap break-words"
          :class="isProblem(log)
            ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
        >
          {{ log }}
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { filterItems, type SortDirection, type SortOption } from '#shared/utils/sorting'

useHead({ title: 'Logs' })

const filter = ref('')
const sortBy = ref('time')
// Newest first by default, same direction control as the other pages
const direction = ref<SortDirection>('desc')

const sortOptions: SortOption[] = [
  { label: 'Time', value: 'time', defaultDirection: 'desc' }
]

/** aMule prefixes warning and error lines with '!'. */
const isProblem = (line: string) => line.trimStart().startsWith('!')

const visibleLogs = computed(() => {
  const lines = filterItems(logs.value, filter.value, line => [line])
  // The daemon returns the log oldest first
  return direction.value === 'desc' ? lines.reverse() : lines
})

const logs = ref<string[]>([])
// Start in the loading state so the first paint never shows "no logs"
const loading = ref(true)
const error = ref<string | null>(null)
const refreshing = ref(false)

async function fetchLogs(silent = false) {
  if (!silent) loading.value = true
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
  await fetchLogs(true)
  refreshing.value = false
}

onMounted(() => {
  fetchLogs()
})
</script>
