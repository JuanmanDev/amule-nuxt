<template>
  <UModal v-model:open="open" :ui="MODAL_TRANSITION_UI" :title="$t('downloads.detailsTitle')" :transition="!shared">
    <template #body>
      <div v-if="download" class="space-y-6">
        <!-- Full file name: wraps instead of truncating, which is the point of this modal -->
        <div class="space-y-2">
          <div class="flex items-start gap-2">
            <!-- The row's title travels here (see useViewTransition) -->
            <p class="text-sm font-semibold break-all leading-snug" :style="{ viewTransitionName: shared ? ACTIVE_TRANSITION_NAME : 'none' }">{{ download.name }}</p>
            <UBadge :color="info.color" variant="subtle" size="sm" class="shrink-0">{{ $t(info.labelKey) }}</UBadge>
          </div>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-clipboard-document"
            @click="copy(download.name, t('downloads.fileNameCopied'))"
          >
            {{ $t('downloads.copyName') }}
          </UButton>
        </div>

        <UAlert
          v-if="reason"
          :color="info.health === 'stalled' ? 'warning' : 'info'"
          variant="subtle"
          :icon="info.health === 'stalled' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
          :description="reason"
        />

        <!-- Progress -->
        <div class="space-y-2">
          <UProgress :model-value="download.percentComplete" :min="0" :max="100" />
          <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{{ formatBytes(download.sizeDone) }} of {{ formatBytes(download.size) }}</span>
            <span>{{ formatPercent(download.percentComplete) }}</span>
          </div>
        </div>

        <!-- Facts -->
        <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-for="fact in facts" :key="fact.label" class="min-w-0">
            <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
            <dd class="font-medium break-words">{{ fact.value }}</dd>
            <p v-if="fact.hint" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{{ fact.hint }}</p>
          </div>
        </dl>

        <!-- Identifiers -->
        <div class="space-y-3">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.fileHash') }}</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ download.hash }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyHash')"
                @click="copy(download.hash, t('downloads.hashCopied'))"
              />
            </div>
          </div>

          <div v-if="download.ed2kLink">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.ed2kLink') }}</div>
            <div class="flex items-start gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ download.ed2kLink }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyLink')"
                @click="copy(download.ed2kLink, t('downloads.linkCopied'))"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <!-- Stacks into full width rows on a phone, where four wrapped buttons of
           different widths are hard to hit; side by side from sm up -->
      <div v-if="download" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
        <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <UButton
            :icon="isPaused ? 'i-heroicons-play' : 'i-heroicons-pause'"
            :loading="busyHash === download.hash"
            variant="outline"
            block
            class="sm:w-auto"
            @click="() => { isPaused ? resume(download!) : pause(download!) }"
          >
            {{ isPaused ? $t('downloads.resume') : $t('downloads.pause') }}
          </UButton>

          <USelect
            :model-value="download.priority"
            :items="priorities"
            value-key="value"
            label-key="label"
            :disabled="busyHash === download.hash"
            icon="i-heroicons-arrow-up"
            class="w-full sm:w-32"
            :aria-label="$t('downloads.fields.priority')"
            @update:model-value="value => setPriority(download!, value as any)"
          />
        </div>

        <div class="flex gap-2 w-full sm:w-auto">
          <UButton
            color="error"
            variant="soft"
            icon="i-heroicons-trash"
            class="flex-1 sm:flex-none justify-center"
            @click="emit('remove', download)"
          >
            {{ $t('common.remove') }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            class="flex-1 sm:flex-none justify-center"
            @click="() => { open = false }"
          >
            {{ $t('common.close') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Download } from '../../server/utils/amule-types';
import { classifyDownload } from '#shared/utils/downloadHealth';
import { formatBytes, formatEta, formatPercent, formatSpeed, formatTimestamp } from '#shared/utils/format';

const props = defineProps<{
  modelValue: boolean;
  download: Download | null;
  /**
   * True while a view transition carries the row into this modal: the title
   * takes the shared name and the modal's own enter animation is switched off,
   * so the browser snapshots it in its final place.
   */
  shared?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  remove: [download: Download];
}>();

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});

const { copy } = useClipboard();
const { t } = useI18n();
const time = useLocalTime();
const { busyHash, pause, resume, setPriority } = useDownloads();

const priorities = computed(() => (['Auto', 'High', 'Normal', 'Low'] as const)
  .map(value => ({ label: t(`downloads.priorities.${value}`), value })));

/** The explanation for the current state, translated. */
const reason = computed(() => {
  const { reasonKey, reasonValues } = info.value;
  if (!reasonKey) return '';
  return reasonValues?.count === undefined
    ? t(reasonKey)
    : t(reasonKey, Number(reasonValues.count), { named: reasonValues });
});

const info = computed(() => classifyDownload(props.download ?? {}));
const isPaused = computed(() => props.download?.status === 'Paused' || props.download?.stopped === true);

const facts = computed(() => {
  const download = props.download;
  if (!download) return [];

  const remaining = Math.max(0, (download.size || 0) - (download.sizeDone || 0));
  const eta = formatEta(remaining, download.speed || 0);

  return [
    { label: t('downloads.fields.status'), value: t(info.value.labelKey) },
    { label: t('downloads.fields.speed'), value: formatSpeed(download.speed) },
    { label: t('downloads.fields.eta'), value: eta ?? '-' },
    { label: t('downloads.fields.size'), value: formatBytes(download.size) },
    { label: t('downloads.fields.remaining'), value: formatBytes(remaining) },
    { label: t('downloads.fields.priority'), value: `${t('downloads.priorities.' + download.priority)}${download.autoPriority ? ' ' + t('downloads.priorities.autoSuffix') : ''}` },
    { label: t('downloads.fields.sources'), value: String(download.sources ?? 0) },
    { label: t('downloads.fields.transferring'), value: String(download.sourcesXfer ?? 0) },
    { label: t('downloads.fields.a4afSources'), value: String(download.sourcesA4AF ?? 0) },
    { label: t('downloads.fields.availableParts'), value: String(download.availableParts ?? 0) },
    { label: t('downloads.fields.lastReceived'), value: formatTimestamp(download.lastReceived) },
    { label: t('downloads.fields.lastSeenComplete'), value: formatTimestamp(download.lastSeenComplete) },
    // Recorded by this app, not by aMule: see server/utils/downloadHistory.ts.
    // aMule's protocol carries no "added" date at all, so a download that
    // predates this app reports when it was first seen - and says so, because
    // that moment is usually just when the server (re)started and reads as a
    // wrong date otherwise.
    {
      label: download.startKnown ? t('downloads.fields.addedAt') : t('downloads.fields.seenSince'),
      value: time.dateTime(download.startKnown ? download.addedAt : download.firstSeenAt),
      hint: download.startKnown ? undefined : t('downloads.fields.observedHint')
    },
    {
      label: download.completedAt ? t('downloads.fields.completedAt') : t('downloads.fields.runningFor'),
      value: download.completedAt
        ? time.dateTime(download.completedAt)
        : (time.duration(download.addedAt ?? download.firstSeenAt, Date.now()) || '-'),
      hint: download.completedAt || download.startKnown ? undefined : t('downloads.fields.runningForHint')
    }
  ];
});

</script>
