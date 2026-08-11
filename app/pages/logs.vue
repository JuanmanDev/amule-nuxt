<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ $t('logs.title') }}</h1>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('logs.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          :loading="refreshing"
          :disabled="loading"
          variant="outline"
          icon="i-heroicons-arrow-path"
          @click="refresh"
        >
          {{ $t('common.refresh') }}
        </UButton>
      </div>
    </div>

    <ListControls
      v-if="!loading && !error && logs.length > 0"
      v-model:search="filter"
      v-model:sort-by="sortBy"
      v-model:direction="direction"
      :options="sortOptions"
      :placeholder="$t('logs.filterPlaceholder')"
      class="sm:max-w-md"
    />

    <!-- Loading is the default state until the first fetch resolves -->
    <SmoothSwap>
    <div v-if="loading" key="loading" class="space-y-2">
      <USkeleton v-for="n in 12" :key="n" class="h-4" :class="n % 3 === 0 ? 'w-2/3' : 'w-full'" />
      <p class="pt-2 text-center text-sm text-gray-600 dark:text-gray-400">{{ $t('logs.loading') }}</p>
    </div>

    <UAlert
      v-else-if="error"
        key="error"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="$t('logs.loadFailed')"
      :description="error"
      :actions="[{ label: $t('common.retry'), color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="logs.length === 0"
        key="empty"
      icon="i-heroicons-document-text"
      :title="$t('logs.emptyTitle')"
      :description="$t('logs.emptyDescription')"
    />

    <UEmpty
      v-else-if="visibleLogs.length === 0"
        key="no-matches"
      icon="i-heroicons-magnifying-glass"
      :title="$t('logs.noMatchesTitle')"
      :description="$t('logs.noMatchesDescription', { query: filter })"
    />

    <div v-else key="lines" class="space-y-2">
      <!-- Lines aMule marks with a leading '!' are warnings or errors -->
      <TransitionGroup
        tag="div"
        name="list"
        class="font-mono text-xs sm:text-sm rounded-lg border border-gray-200 dark:border-gray-800 max-h-[70vh] overflow-auto divide-y divide-gray-100 dark:divide-gray-800 bg-default/40 backdrop-blur-sm"
      >
        <div
          v-for="line in visibleLogs"
          :key="line.index"
          class="px-3 py-1.5 whitespace-pre-wrap break-words"
          :class="isProblem(line.text)
            ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
        >
          {{ line.text }}
        </div>
      </TransitionGroup>

      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :page-count="pageCount"
        :matched="matched"
        :total="total"
        :first-on-page="firstOnPage"
        :last-on-page="lastOnPage"
        label="lines"
      />
    </div>
    </SmoothSwap>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SortOption } from '#shared/utils/sorting'

const { t } = useI18n()
useHead({ title: () => t('logs.title') })

const sortOptions = computed<SortOption[]>(() => [
  { label: t('sort.time'), value: 'time', defaultDirection: 'desc' }
])

/** aMule prefixes warning and error lines with '!'. */
const isProblem = (line: string) => line.trimStart().startsWith('!')

const logs = ref<string[]>([])

/**
 * Numbered lines, because the log has no other identity: the daemon returns
 * plain strings, oldest first, and the same message can repeat. The number is
 * both the row key and what "sort by time" orders on.
 */
const numberedLogs = computed(() => logs.value.map((text, index) => ({ index, text })))

// Newest first by default, and only a page of them: a busy daemon's buffer runs
// to thousands of lines, which used to all be in the DOM at once.
const {
  search: filter,
  sortBy,
  direction,
  page,
  pageSize,
  visible: visibleLogs,
  matched,
  total,
  pageCount,
  firstOnPage,
  lastOnPage
} = usePaginatedList<{ index: number; text: string }>({
  items: numberedLogs,
  fields: line => [line.text],
  accessors: { time: line => line.index },
  sortBy: 'time',
  direction: 'desc',
  storageKey: 'logs'
})
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
