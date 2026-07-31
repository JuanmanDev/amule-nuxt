<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-3xl' }" title="Download details">
    <template #body>
      <div v-if="download" class="space-y-6">
        <!-- Full file name: wraps instead of truncating, which is the point of this modal -->
        <div class="space-y-2">
          <div class="flex items-start gap-2">
            <p class="text-sm font-semibold break-all leading-snug">{{ download.name }}</p>
            <UBadge :color="info.color" variant="subtle" size="sm" class="shrink-0">{{ info.label }}</UBadge>
          </div>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-clipboard-document"
            @click="copy(download.name, 'File name copied')"
          >
            Copy name
          </UButton>
        </div>

        <UAlert
          v-if="info.reason"
          :color="info.health === 'stalled' ? 'warning' : 'info'"
          variant="subtle"
          :icon="info.health === 'stalled' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
          :description="info.reason"
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
          </div>
        </dl>

        <!-- Identifiers -->
        <div class="space-y-3">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">File hash</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ download.hash }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                aria-label="Copy hash"
                @click="copy(download.hash, 'Hash copied')"
              />
            </div>
          </div>

          <div v-if="download.ed2kLink">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">eD2k link</div>
            <div class="flex items-start gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ download.ed2kLink }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                aria-label="Copy ed2k link"
                @click="copy(download.ed2kLink, 'ed2k link copied')"
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
            {{ isPaused ? 'Resume' : 'Pause' }}
          </UButton>

          <USelect
            :model-value="download.priority"
            :items="priorities"
            :disabled="busyHash === download.hash"
            icon="i-heroicons-arrow-up"
            class="w-full sm:w-32"
            aria-label="Download priority"
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
            Remove
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            class="flex-1 sm:flex-none justify-center"
            @click="() => { open = false }"
          >
            Close
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
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  remove: [download: Download];
}>();

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});

const toast = useToast();
const { busyHash, pause, resume, setPriority } = useDownloads();

const priorities = ['Auto', 'High', 'Normal', 'Low'];

const info = computed(() => classifyDownload(props.download ?? {}));
const isPaused = computed(() => props.download?.status === 'Paused' || props.download?.stopped === true);

const facts = computed(() => {
  const download = props.download;
  if (!download) return [];

  const remaining = Math.max(0, (download.size || 0) - (download.sizeDone || 0));
  const eta = formatEta(remaining, download.speed || 0);

  return [
    { label: 'Status', value: download.status },
    { label: 'Speed', value: formatSpeed(download.speed) },
    { label: 'ETA', value: eta ?? '-' },
    { label: 'Size', value: formatBytes(download.size) },
    { label: 'Remaining', value: formatBytes(remaining) },
    { label: 'Priority', value: `${download.priority}${download.autoPriority ? ' (auto)' : ''}` },
    { label: 'Sources', value: String(download.sources ?? 0) },
    { label: 'Transferring', value: String(download.sourcesXfer ?? 0) },
    { label: 'A4AF sources', value: String(download.sourcesA4AF ?? 0) },
    { label: 'Available parts', value: String(download.availableParts ?? 0) },
    { label: 'Last data received', value: formatTimestamp(download.lastReceived) },
    { label: 'Last seen complete', value: formatTimestamp(download.lastSeenComplete) }
  ];
});

async function copy(value: string, successTitle: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: successTitle, color: 'success' });
  } catch {
    toast.add({ title: 'Could not copy to clipboard', description: value, color: 'warning' });
  }
}
</script>
