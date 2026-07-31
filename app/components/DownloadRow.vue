<template>
  <div
    class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    role="button"
    tabindex="0"
    :aria-label="`Show details for ${download.name}`"
    @click="emit('open', download)"
    @keydown.enter.prevent="emit('open', download)"
    @keydown.space.prevent="emit('open', download)"
  >
    <div class="min-w-0 space-y-2">
      <div class="flex items-start justify-between gap-2">
        <!-- Long names truncate here; the details modal shows them in full -->
        <div class="min-w-0 flex items-center gap-2">
          <p class="font-semibold truncate" :title="download.name">{{ download.name }}</p>
          <UBadge :color="info.color" variant="subtle" size="sm" class="shrink-0">
            <AnimatedValue :model-value="info.label" />
          </UBadge>
        </div>

        <div class="flex items-center gap-1 shrink-0" @click.stop>
          <UButton
            icon="i-heroicons-information-circle"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Details"
            @click="emit('open', download)"
          />
          <UDropdownMenu :items="actions" :modal="false">
            <UButton
              icon="i-heroicons-ellipsis-vertical"
              variant="ghost"
              size="xs"
              :loading="busy"
              aria-label="Actions"
            />
          </UDropdownMenu>
        </div>
      </div>

      <!-- Why this entry is not progressing -->
      <div
        v-if="info.reason"
        class="flex items-start gap-2 text-xs"
        :class="info.health === 'stalled' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'"
      >
        <UIcon
          :name="info.health === 'stalled' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
          class="w-4 h-4 shrink-0 mt-0.5"
        />
        <span class="min-w-0">{{ info.reason }}</span>
        <UButton
          v-if="dead"
          size="xs"
          color="error"
          variant="ghost"
          icon="i-heroicons-trash"
          class="shrink-0"
          @click.stop="emit('remove', download)"
        >
          Remove
        </UButton>
      </div>

      <UProgress :model-value="download.percentComplete" :min="0" :max="100" size="md">
        <template #indicator>
          <div class="text-xs text-right">
            <AnimatedValue :model-value="formatPercent(download.percentComplete)" :flash="false" />
          </div>
        </template>
      </UProgress>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
        <div class="flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">Size</span>
          <span class="font-medium truncate">
            {{ formatBytes(download.sizeDone) }} / {{ formatBytes(download.size) }}
          </span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">Speed</span>
          <span class="font-medium flex items-center gap-1 truncate">
            <UIcon name="i-heroicons-arrow-down" class="w-3 h-3 shrink-0" />
            <AnimatedValue :model-value="formatSpeed(download.speed)" />
          </span>
        </div>
        <!-- Hidden on a phone: a third column wrapped the stats onto a new row -->
        <div class="hidden sm:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">ETA</span>
          <span class="font-medium truncate">{{ eta ?? '-' }}</span>
        </div>
        <div class="hidden sm:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">Sources</span>
          <span class="font-medium flex items-center gap-1">
            <UIcon name="i-heroicons-user-group" class="w-3 h-3 shrink-0" />
            <AnimatedValue :model-value="download.sources" /><span class="text-gray-400">/{{ download.sourcesXfer }}</span>
          </span>
        </div>
        <div class="hidden lg:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">Priority</span>
          <span class="font-medium truncate">
            {{ download.priority }}{{ download.autoPriority ? ' (auto)' : '' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { Download } from '../../server/utils/amule-types';
import { classifyDownload, isLikelyDeadLink } from '#shared/utils/downloadHealth';
import { formatBytes, formatEta, formatPercent, formatSpeed } from '#shared/utils/format';

const props = defineProps<{
  download: Download;
  busy?: boolean;
}>();

const emit = defineEmits<{
  open: [download: Download];
  remove: [download: Download];
  pause: [download: Download];
  resume: [download: Download];
  priority: [download: Download, priority: 'Auto' | 'High' | 'Normal' | 'Low'];
}>();

const info = computed(() => classifyDownload(props.download));
const dead = computed(() => isLikelyDeadLink(props.download));
const isPaused = computed(() => props.download.status === 'Paused' || props.download.stopped);
const eta = computed(() =>
  formatEta(Math.max(0, (props.download.size || 0) - (props.download.sizeDone || 0)), props.download.speed || 0)
);

const actions = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Details',
      icon: 'i-heroicons-information-circle',
      onSelect: () => emit('open', props.download)
    },
    {
      label: isPaused.value ? 'Resume' : 'Pause',
      icon: isPaused.value ? 'i-heroicons-play' : 'i-heroicons-pause',
      onSelect: () => isPaused.value
        ? emit('resume', props.download)
        : emit('pause', props.download)
    }
  ],
  [
    {
      label: 'Priority',
      icon: 'i-heroicons-arrow-up',
      children: (['Auto', 'High', 'Normal', 'Low'] as const).map(priority => ({
        label: priority,
        onSelect: () => emit('priority', props.download, priority)
      }))
    }
  ],
  [
    {
      label: 'Remove',
      icon: 'i-heroicons-trash',
      color: 'error' as const,
      onSelect: () => emit('remove', props.download)
    }
  ]
]);
</script>
