<!--
  Everything the daemon knows about one search result, plus the things that can be
  worked out from it: the link, the kind of file, and whether it is already here.

  The list rows have to truncate; this is where the full name, the hash and the
  link live, and where a result is turned into a download.
-->
<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-3xl' }" :title="$t('search.result.title')" :transition="!shared">
    <template #body>
      <div v-if="result" class="space-y-6">
        <div class="space-y-2">
          <div class="flex items-start gap-2">
            <UIcon :name="kindIcon" class="w-5 h-5 mt-0.5 shrink-0 text-gray-400" />
            <!-- The row's title travels here (see useDetailsTransition) -->
            <p class="text-sm font-semibold break-all leading-snug flex-1" :style="{ viewTransitionName: shared ? ACTIVE_TRANSITION_NAME : 'none' }">{{ result.fileName }}</p>
            <UBadge v-if="status.state !== 'unknown'" :color="status.color" variant="subtle" size="sm" class="shrink-0">
              {{ $t(`status.${status.state}`) }}
            </UBadge>
          </div>
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-clipboard-document"
            @click="copy(result.fileName, t('downloads.fileNameCopied'))"
          >
            {{ $t('downloads.copyName') }}
          </UButton>
        </div>

        <!-- A result nobody holds in full is the one people waste days on -->
        <UAlert
          v-if="warning"
          color="warning"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
          :description="warning"
        />

        <!-- What the queue says, when this file is already in it -->
        <div v-if="status.download" class="space-y-2">
          <UProgress :model-value="status.percent" :min="0" :max="100" />
          <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{{ formatBytes(status.download.sizeDone) }} of {{ formatBytes(status.download.size) }}</span>
            <span>{{ formatPercent(status.percent) }} · {{ formatSpeed(status.download.speed) }}</span>
          </div>
        </div>

        <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-for="fact in facts" :key="fact.label" class="min-w-0">
            <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
            <dd class="font-medium break-words">{{ fact.value }}</dd>
          </div>
        </dl>

        <div class="space-y-3">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.fileHash') }}</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                {{ result.hash || $t('search.result.noHash') }}
              </code>
              <UButton
                v-if="result.hash"
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyHash')"
                @click="copy(result.hash, t('downloads.hashCopied'))"
              />
            </div>
          </div>

          <div v-if="result.ed2kLink">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.ed2kLink') }}</div>
            <div class="flex items-start gap-2">
              <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto flex-1">{{ result.ed2kLink }}</code>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-heroicons-clipboard-document"
                :aria-label="$t('downloads.copyLink')"
                @click="copy(result.ed2kLink, t('downloads.linkCopied'))"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="result" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
        <UButton
          v-if="status.state === 'unknown'"
          icon="i-heroicons-arrow-down-tray"
          :loading="busy"
          :disabled="!result.hash"
          block
          class="sm:w-auto"
          @click="emit('download', result)"
        >
          {{ $t('search.result.addToDownloads') }}
        </UButton>

        <UButton
          v-else
          :icon="status.done ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-down-tray'"
          :color="status.done ? 'success' : 'neutral'"
          variant="soft"
          :to="status.state === 'shared' ? `/shared?file=${result.hash}` : '/downloads'"
          block
          class="sm:w-auto"
        >
          {{ status.state === 'shared' ? $t('search.result.showInShared') : $t('search.result.showInDownloads') }}
        </UButton>

        <UButton color="neutral" variant="ghost" class="sm:w-auto justify-center" @click="() => { open = false }">
          {{ $t('common.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { SearchResult } from '../../server/utils/amule-types';
import type { FileStatus } from '../composables/useFileStatus';
import { formatBytes, formatPercent, formatSpeed } from '#shared/utils/format';
import { fileKind, fileKindIcon } from '#shared/utils/fileKind';

const props = defineProps<{
  modelValue: boolean;
  result: SearchResult | null;
  status: FileStatus;
  busy?: boolean;
  /** Which search this came from, shown as context. */
  searchLabel?: string;
  /**
   * True while a view transition carries a row into this modal: the title
   * takes the shared name and the modal's own enter animation is switched off,
   * so the browser snapshots it in its final place.
   */
  shared?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  download: [result: SearchResult];
}>();

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});

const { copy } = useClipboard();
const { t } = useI18n();

const kindIcon = computed(() => fileKindIcon(props.result?.fileName ?? ''));

const facts = computed(() => {
  const result = props.result;
  if (!result) return [];

  const entries = [
    { label: t('search.result.fields.size'), value: formatBytes(result.size) },
    { label: t('search.result.fields.sizeBytes'), value: result.size.toLocaleString() },
    { label: t('search.result.fields.kind'), value: t(`fileKinds.${fileKind(result.fileName)}`) },
    { label: t('search.result.fields.extension'), value: result.extension ? result.extension.toUpperCase() : t('common.none') },
    { label: t('search.result.fields.sources'), value: result.sources.toLocaleString() }
  ];

  if (props.searchLabel) {
    entries.push({ label: t('search.result.fields.foundBy'), value: props.searchLabel });
  }

  if (props.status.download) {
    entries.push(
      { label: t('search.result.fields.queueStatus'), value: t(`status.${props.status.state}`) },
      { label: t('search.result.fields.queueSources'), value: props.status.download.sources.toLocaleString() }
    );
  }

  return entries;
});

/**
 * The one case worth warning about before a download is started: nobody is
 * offering the file at all.
 *
 * There is deliberately no "no complete source" warning. aMule reports nothing
 * about completeness for a search result, and the tag that looked like it is 0
 * for every result on a live daemon - so that warning appeared on all of them.
 */
const warning = computed(() => {
  const result = props.result;
  if (!result || props.status.done) return '';

  return result.sources === 0 ? t('search.result.noSourcesWarning') : '';
});
</script>
