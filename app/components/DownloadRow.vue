<template>
  <div
    class="p-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-default/40 backdrop-blur-sm transition-colors cursor-pointer hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    role="button"
    tabindex="0"
    data-testid="download-row"
    :data-hash="download.hash"
    :class="selectable && selected ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-default' : ''"
    :aria-label="$t('downloads.showDetailsFor', { name: download.name })"
    @click="onRowClick"
    @keydown.enter.prevent="onRowClick"
    @keydown.space.prevent="onRowClick"
  >
    <div class="min-w-0 space-y-2">
      <div class="flex items-center gap-2">
        <!-- Only while selecting. The row itself toggles too, so the checkbox is
             a target rather than the only way in. -->
        <UCheckbox
          v-if="selectable"
          :model-value="selected"
          class="shrink-0"
          :aria-label="$t('selection.selectRow', { name: download.name })"
          @update:model-value="value => emit('select', download, value === true)"
          @click.stop
        />
        <!-- Long names truncate here; the details modal shows them in full. The
             name takes the space that is left so the badge lands next to the
             actions at the right edge on every width, not adrift mid-row after a
             short name on a wide screen. -->
        <p class="font-semibold truncate min-w-0 flex-1" :title="download.name">{{ download.name }}</p>
        <UBadge :color="info.color" variant="subtle" size="sm" class="shrink-0">
          <AnimatedValue :model-value="$t(info.labelKey)" />
        </UBadge>

        <div class="flex items-center gap-1 shrink-0" @click.stop>
          <UButton
            icon="i-heroicons-information-circle"
            variant="ghost"
            color="neutral"
            size="xs"
            :aria-label="$t('common.details')"
            @click="emit('open', download)"
          />
          <UDropdownMenu :items="actions" :modal="false">
            <UButton
              icon="i-heroicons-ellipsis-vertical"
              variant="ghost"
              size="xs"
              :loading="busy"
              :aria-label="$t('common.actions')"
            />
          </UDropdownMenu>
        </div>
      </div>

      <!-- Why this entry is not progressing. Full width, with the remove action
           pushed to the far right so it lines up with the row's other controls
           instead of trailing the end of the sentence. -->
      <div
        v-if="reason"
        class="flex items-start gap-2 text-xs w-full"
        :class="info.health === 'stalled' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'"
      >
        <UIcon
          :name="info.health === 'stalled' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
          class="w-4 h-4 shrink-0 mt-0.5"
        />
        <span class="min-w-0 flex-1">{{ reason }}</span>
        <UButton
          v-if="dead"
          size="xs"
          color="error"
          variant="ghost"
          icon="i-heroicons-trash"
          class="shrink-0 ms-auto"
          @click.stop="emit('remove', download)"
        >
          {{ $t('common.remove') }}
        </UButton>
      </div>

      <UProgress :model-value="download.percentComplete" :min="0" :max="100" size="md">
        <template #indicator>
          <div class="text-xs text-right">
            <AnimatedValue :model-value="formatPercent(download.percentComplete)" :flash="false" />
          </div>
        </template>
      </UProgress>

      <!--
        One row of stats at every width, which means the number of columns has to
        match the number of cells that are actually visible:

          < 640   2 columns   size, speed
          ≥ 640   3 columns   + ETA
          ≥ 768   4 columns   + sources
          ≥ 1024  5 columns   + priority
          ≥ 1280  6 columns   + started / completed

        Getting that wrong is not subtle: four cells in three columns wrapped the
        stats onto a second row for every download between 640 and 1024px.
      -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 text-sm">
        <div class="flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('downloads.fields.size') }}</span>
          <span class="font-medium truncate">
            {{ formatBytes(download.sizeDone) }} / {{ formatBytes(download.size) }}
          </span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('downloads.fields.speed') }}</span>
          <span class="font-medium flex items-center gap-1 truncate">
            <UIcon name="i-heroicons-arrow-down" class="w-3 h-3 shrink-0" />
            <AnimatedValue :model-value="formatSpeed(download.speed)" />
          </span>
        </div>
        <!-- Hidden on a phone: a third column wrapped the stats onto a new row -->
        <div class="hidden sm:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('downloads.fields.eta') }}</span>
          <span class="font-medium truncate">{{ eta ?? '-' }}</span>
        </div>
        <div class="hidden md:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('downloads.fields.sources') }}</span>
          <span class="font-medium flex items-center gap-1">
            <UIcon name="i-heroicons-user-group" class="w-3 h-3 shrink-0" />
            <AnimatedValue :model-value="download.sources" /><span class="text-gray-400">/{{ download.sourcesXfer }}</span>
          </span>
        </div>
        <!-- Recorded by this app rather than by aMule, which keeps no such
             timestamp. Only from xl up: the row is already dense, and the
             details modal carries it at every width. -->
        <div class="hidden xl:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">
            {{ download.completedAt ? $t('downloads.fields.completedAt') : startedLabel }}
          </span>
          <span class="font-medium truncate" :title="startedTitle">{{ startedValue }}</span>
        </div>
        <div class="hidden lg:flex flex-col min-w-0">
          <span class="text-gray-500 dark:text-gray-400 text-xs">{{ $t('downloads.fields.priority') }}</span>
          <span class="font-medium truncate">
            {{ $t(`downloads.priorities.${download.priority}`) }}{{ download.autoPriority ? ' ' + $t('downloads.priorities.autoSuffix') : '' }}
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
  /** True while the list is in selection mode. */
  selectable?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{
  open: [download: Download];
  remove: [download: Download];
  pause: [download: Download];
  resume: [download: Download];
  priority: [download: Download, priority: 'Auto' | 'High' | 'Normal' | 'Low'];
  select: [download: Download, selected: boolean];
}>();

/**
 * While selecting, the whole row is the checkbox.
 *
 * Opening the details modal instead would fight the thing the user is in the
 * middle of doing, and hitting a 20px box for each of thirty rows is miserable
 * on a phone. The information button in the row still opens the details.
 */
function onRowClick() {
  if (props.selectable) {
    emit('select', props.download, !props.selected);
    return;
  }

  emit('open', props.download);
}

const { t } = useI18n();
// Timestamps are formatted after mount only: see useLocalTime
const time = useLocalTime();

const info = computed(() => classifyDownload(props.download));

/** The explanation, translated; absent for a download with nothing to explain. */
const reason = computed(() => {
  const { reasonKey, reasonValues } = info.value;
  if (!reasonKey) return '';
  // A plural key needs the count as its second argument, not only as a value
  return reasonValues?.count === undefined
    ? t(reasonKey)
    : t(reasonKey, Number(reasonValues.count), { named: reasonValues });
});
/*
 * When this download started, and when it finished.
 *
 * aMule reports neither, so both come from this app's own record of the queue
 * (server/utils/downloadHistory.ts). A download that was already queued the
 * first time the app looked has no start time to report, and says how long it
 * has been in the queue instead of inventing one.
 */
const startedLabel = computed(() =>
  props.download.startKnown ? t('downloads.fields.addedAt') : t('downloads.fields.seenSince')
);

const startedValue = computed(() => {
  if (props.download.completedAt) {
    return time.dateTime(props.download.completedAt);
  }
  const from = props.download.startKnown ? props.download.addedAt : props.download.firstSeenAt;
  return time.dateTime(from);
});

/** The hover text adds how long it has been going, which the column has no room for. */
const startedTitle = computed(() => {
  const from = props.download.addedAt ?? props.download.firstSeenAt;
  const elapsed = time.duration(from, props.download.completedAt ?? Date.now());

  if (!elapsed) return startedValue.value;

  return props.download.completedAt
    ? `${startedValue.value} · ${t('downloads.fields.tookTime')} ${elapsed}`
    : `${startedValue.value} · ${t('downloads.fields.runningFor')} ${elapsed}`;
});

const dead = computed(() => isLikelyDeadLink(props.download));
const isPaused = computed(() => props.download.status === 'Paused' || props.download.stopped);
const eta = computed(() =>
  formatEta(Math.max(0, (props.download.size || 0) - (props.download.sizeDone || 0)), props.download.speed || 0)
);

const actions = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('common.details'),
      icon: 'i-heroicons-information-circle',
      onSelect: () => emit('open', props.download)
    },
    {
      label: isPaused.value ? t('downloads.resume') : t('downloads.pause'),
      icon: isPaused.value ? 'i-heroicons-play' : 'i-heroicons-pause',
      onSelect: () => isPaused.value
        ? emit('resume', props.download)
        : emit('pause', props.download)
    }
  ],
  [
    {
      label: t('downloads.priority'),
      icon: 'i-heroicons-arrow-up',
      children: (['Auto', 'High', 'Normal', 'Low'] as const).map(priority => ({
        label: t(`downloads.priorities.${priority}`),
        onSelect: () => emit('priority', props.download, priority)
      }))
    }
  ],
  [
    {
      label: t('common.remove'),
      icon: 'i-heroicons-trash',
      color: 'error' as const,
      onSelect: () => emit('remove', props.download)
    }
  ]
]);
</script>
