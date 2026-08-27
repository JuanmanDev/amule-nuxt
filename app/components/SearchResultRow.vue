<!--
  One search result.

  The row answers the two questions the old one could not: what kind of file is
  this, and do I already have it? A result that is already downloading shows its
  progress instead of an action that would do nothing, and one that is finished
  says so.
-->
<template>
  <div
    class="p-3 sm:p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-default/40 backdrop-blur-sm cursor-pointer hover:bg-elevated/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    role="button"
    tabindex="0"
    :aria-label="$t('search.result.showDetailsFor', { name: result.fileName })"
    @click="emit('open', result)"
    @keydown.enter.prevent="emit('open', result)"
    @keydown.space.prevent="emit('open', result)"
  >
    <div class="flex items-start gap-3">
      <UIcon :name="kindIcon" class="w-5 h-5 mt-0.5 shrink-0 text-gray-400 hidden sm:block" :aria-hidden="true" />

      <div class="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
        <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
          <h3 class="font-semibold truncate min-w-0 flex-1 text-sm sm:text-base leading-tight" :title="result.fileName">{{ result.fileName }}</h3>
          <UBadge v-if="status.state !== 'unknown'" :color="status.color" variant="subtle" size="sm" class="shrink-0 self-start">
            {{ $t(`status.${status.state}`) }}
          </UBadge>
        </div>

        <div class="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          <span class="flex items-center gap-1">
            <UIcon name="i-heroicons-document" class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {{ formatBytes(result.size) }}
          </span>

          <!-- How many sources reported the file. -->
          <span class="flex items-center gap-1" :class="sourceTone">
            <UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {{ sourcesLabel }}
          </span>

          <UBadge v-if="result.extension" color="neutral" variant="subtle" size="xs" class="hidden sm:inline-flex">
            {{ result.extension.toUpperCase() }}
          </UBadge>
          <span class="hidden sm:inline">{{ kindLabel }}</span>
        </div>

        <!-- Only for a file that is actually on its way here -->
        <div v-if="status.download && !status.done" class="space-y-1 mt-2">
          <UProgress :model-value="status.percent" :min="0" :max="100" size="xs" class="sm:h-2" />
          <div class="flex flex-wrap gap-x-2 sm:gap-x-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
            <span>{{ formatPercent(status.percent) }}</span>
            <span>{{ formatSpeed(status.download.speed) }}</span>
            <span class="hidden sm:inline">{{ formatBytes(status.download.sizeDone) }} of {{ formatBytes(status.download.size) }}</span>
          </div>
        </div>
      </div>

      <div class="shrink-0 ml-1" @click.stop>
        <UButton
          v-if="status.state === 'unknown'"
          :loading="busy"
          :disabled="!result.hash"
          size="sm"
          icon="i-heroicons-arrow-down-tray"
          @click="emit('download', result)"
        >
          <span class="hidden sm:inline">{{ $t('search.result.download') }}</span>
        </UButton>

        <UButton
          v-else
          size="sm"
          :color="status.done ? 'success' : 'neutral'"
          variant="soft"
          trailing-icon="i-heroicons-arrow-right"
          :to="status.state === 'shared' ? `/shared?file=${result.hash}` : '/downloads'"
        >
          <span class="hidden sm:inline">{{ $t('search.result.show') }}</span>
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SearchResult } from '../../server/utils/amule-types';
import type { FileStatus } from '../composables/useFileStatus';
import { formatBytes, formatPercent, formatSpeed } from '#shared/utils/format';
import { fileKind, fileKindIcon } from '#shared/utils/fileKind';

const props = defineProps<{
  result: SearchResult;
  /** What the daemon already knows about this hash. */
  status: FileStatus;
  /** True while this result's download request is in flight. */
  busy?: boolean;
}>();

const emit = defineEmits<{
  open: [result: SearchResult];
  download: [result: SearchResult];
}>();

const { t } = useI18n();

/**
 * "1 source" / "12 sources", picked by the language's own plural rules - which
 * is why the count goes in as the plural choice *and* as a formatted value.
 */
const sourcesLabel = computed(() => t(
  'search.result.sources',
  { count: props.result.sources.toLocaleString() },
  props.result.sources
));

const kindIcon = computed(() => fileKindIcon(props.result.fileName));
const kindLabel = computed(() => t(`fileKinds.${fileKind(props.result.fileName)}`));

/** No source at all is the one thing worth a colour before downloading. */
const sourceTone = computed(() =>
  props.result.sources === 0 ? 'text-amber-600 dark:text-amber-400' : ''
);
</script>
