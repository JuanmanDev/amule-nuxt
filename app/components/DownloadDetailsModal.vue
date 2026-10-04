<template>
  <UModal v-model:open="open" :ui="MODAL_TRANSITION_UI" :title="$t('downloads.detailsTitle')" :transition="!shared">
    <template #body>
      <div v-if="view" class="space-y-5">
        <!-- Top header: file name, status badge, copy button -->
        <div class="space-y-2">
          <div class="flex items-start gap-2">
            <!-- The row's title travels here (see useViewTransition) -->
            <p class="text-sm font-semibold break-all leading-snug" :style="{ viewTransitionName: shared ? ACTIVE_TRANSITION_NAME : 'none' }">{{ view.name }}</p>
            <UBadge :color="info.color" variant="subtle" size="sm" class="shrink-0">{{ $t(info.labelKey) }}</UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              @click="copy(view.name, t('downloads.fileNameCopied'))"
            >
              {{ $t('downloads.copyName') }}
            </UButton>
            <span
              v-if="isPartsEstimated"
              class="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"
              :title="$t('downloads.partBar.unavailableHint')"
            >
              <UIcon name="i-heroicons-information-circle" />
              {{ $t('downloads.parts.estimatedBadge') }}
            </span>
          </div>
        </div>

        <UAlert
          v-if="reason"
          :color="info.health === 'stalled' ? 'warning' : 'info'"
          variant="subtle"
          :icon="info.health === 'stalled' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
          :description="reason"
        />

        <!-- Tabbed Interface: Overview | Parts Breakdown | Swarm & Details -->
        <UTabs v-model="activeTab" :items="tabs" class="w-full">
          <template #content="{ item }">
            <!-- OVERVIEW TAB -->
            <div v-if="item.value === 'overview'" class="space-y-5 pt-3">
              <!-- Progress & Classic aMule Part Bar -->
              <div class="space-y-2">
                <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-medium text-gray-700 dark:text-gray-300">
                    {{ $t('downloads.detail.sizeOf', { done: formatBytes(view.sizeDone), total: formatBytes(view.size) }) }}
                  </span>
                  <span class="font-semibold text-primary">
                    {{ formatPercent(view.percentComplete) }}
                  </span>
                </div>
                <UProgress :model-value="view.percentComplete" :min="0" :max="100" />

                <!-- Classic aMule segmented part bar -->
                <div class="pt-1">
                  <DownloadPartBar
                    :parts="effectiveParts"
                    :file-size="view.size"
                    :is-estimated="isPartsEstimated"
                    :active-part-index="activePartIndex"
                    @select-part="onSelectPartFromBar"
                  />
                </div>
              </div>

              <!-- Quick highlight cards -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div class="p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40">
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ $t('downloads.fields.speed') }}</div>
                  <div class="text-sm font-semibold mt-0.5">{{ formatSpeed(view.speed) }}</div>
                  <div class="text-[10px] text-gray-400 mt-0.5">{{ $t('downloads.fields.eta') }}: {{ factsEta }}</div>
                </div>

                <div class="p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40">
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ $t('downloads.fields.sources') }}</div>
                  <div class="text-sm font-semibold mt-0.5">
                    {{ view.sources ?? 0 }}
                    <span v-if="view.sourcesXfer" class="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                      ({{ view.sourcesXfer }} {{ $t('downloads.fields.transferring').toLowerCase() }})
                    </span>
                  </div>
                  <div class="text-[10px] text-gray-400 mt-0.5">{{ view.sourcesA4AF ?? 0 }} A4AF</div>
                </div>

                <div class="col-span-2 sm:col-span-1 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40">
                  <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ $t('downloads.parts.swarmAvailability') }}</div>
                  <div class="text-sm font-semibold mt-0.5">
                    {{ partCounts.complete + partCounts.pending }} / {{ effectiveParts.length }}
                    <span class="text-xs font-normal text-gray-500">({{ swarmAvailabilityPercent }}%)</span>
                  </div>
                  <div class="text-[10px]" :class="partCounts.unavailable === 0 ? 'text-emerald-500' : 'text-amber-500'">
                    {{ partCounts.unavailable === 0 ? $t('downloads.parts.healthySwarm') : $t('downloads.parts.incompleteSwarm', { count: partCounts.unavailable }) }}
                  </div>
                </div>
              </div>

              <!-- Media metadata amuled probed (aMule 3.1, amuleapi only) -->
              <div
                v-if="mediaFacts.length"
                class="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 text-xs"
              >
                <UIcon name="i-heroicons-film" class="text-gray-400 shrink-0" />
                <span v-for="fact in mediaFacts" :key="fact.label" class="min-w-0">
                  <span class="text-gray-500 dark:text-gray-400">{{ fact.label }}:</span>
                  <span class="font-medium ml-1 break-words">{{ fact.value }}</span>
                </span>
              </div>

              <!-- Facts list -->
              <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2">
                <div v-for="fact in facts" :key="fact.label" class="min-w-0">
                  <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
                  <dd class="font-medium break-words mt-0.5">{{ fact.value }}</dd>
                  <p v-if="fact.hint" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">{{ fact.hint }}</p>
                </div>
              </dl>

              <!-- Identifiers -->
              <div class="space-y-3 pt-2">
                <div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.fileHash') }}</div>
                  <div class="flex items-center gap-2">
                    <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">{{ view.hash }}</code>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-heroicons-clipboard-document"
                      :aria-label="$t('downloads.copyHash')"
                      @click="copy(view.hash, t('downloads.hashCopied'))"
                    />
                  </div>
                </div>

                <div v-if="view.ed2kLink">
                  <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ $t('downloads.ed2kLink') }}</div>
                  <div class="flex items-start gap-2">
                    <code class="text-xs font-mono break-all bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 max-h-24 overflow-y-auto">{{ view.ed2kLink }}</code>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      icon="i-heroicons-clipboard-document"
                      :aria-label="$t('downloads.copyLink')"
                      @click="copy(view.ed2kLink, t('downloads.linkCopied'))"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- PARTS BREAKDOWN TAB -->
            <div v-else-if="item.value === 'parts'" class="space-y-4 pt-3">
              <!-- Classic aMule Part Bar at the top of parts tab -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-medium text-gray-700 dark:text-gray-300">
                    {{ $t('downloads.parts.title') }} ({{ $t('downloads.parts.totalParts', { count: effectiveParts.length }, effectiveParts.length) }})
                  </span>
                  <span class="text-[11px]">{{ $t('downloads.parts.chunkSize') }}</span>
                </div>
                <DownloadPartBar
                  :parts="effectiveParts"
                  :file-size="view.size"
                  :is-estimated="isPartsEstimated"
                  :active-part-index="activePartIndex"
                  @select-part="onSelectPartFromBar"
                />
              </div>

              <!-- Filter tabs & Part search -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <div class="flex flex-wrap items-center gap-1">
                  <UButton
                    size="xs"
                    :variant="partFilter === 'all' ? 'soft' : 'ghost'"
                    :color="partFilter === 'all' ? 'primary' : 'neutral'"
                    @click="partFilter = 'all'"
                  >
                    {{ $t('downloads.parts.filterAll') }} ({{ detailedParts.length }})
                  </UButton>
                  <UButton
                    size="xs"
                    :variant="partFilter === 'complete' ? 'soft' : 'ghost'"
                    :color="partFilter === 'complete' ? 'success' : 'neutral'"
                    @click="partFilter = 'complete'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                    {{ $t('downloads.parts.filterComplete') }} ({{ partCounts.complete }})
                  </UButton>
                  <UButton
                    size="xs"
                    :variant="partFilter === 'pending' ? 'soft' : 'ghost'"
                    :color="partFilter === 'pending' ? 'info' : 'neutral'"
                    @click="partFilter = 'pending'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />
                    {{ $t('downloads.parts.filterAvailable') }} ({{ partCounts.pending }})
                  </UButton>
                  <UButton
                    size="xs"
                    :variant="partFilter === 'unavailable' ? 'soft' : 'ghost'"
                    :color="partFilter === 'unavailable' ? 'error' : 'neutral'"
                    @click="partFilter = 'unavailable'"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1" />
                    {{ $t('downloads.parts.filterUnavailable') }} ({{ partCounts.unavailable }})
                  </UButton>
                </div>

                <div class="w-full sm:w-48">
                  <UInput
                    v-model="partSearch"
                    icon="i-heroicons-magnifying-glass"
                    size="xs"
                    :placeholder="$t('downloads.parts.searchPlaceholder')"
                  >
                    <template v-if="partSearch" #trailing>
                      <UButton
                        icon="i-heroicons-x-mark"
                        variant="link"
                        color="neutral"
                        size="xs"
                        @click="partSearch = ''"
                      />
                    </template>
                  </UInput>
                </div>
              </div>

              <!-- List of parts with full details -->
              <div class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-elevated/40">
                <div class="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/80">
                  <div
                    v-for="part in filteredParts"
                    :key="part.partNumber"
                    class="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    :class="activePartIndex === part.index ? 'bg-primary-50 dark:bg-primary-950/30' : ''"
                    @click="activePartIndex = part.index"
                  >
                    <!-- Left: Part number & range -->
                    <div class="flex items-center gap-2.5 min-w-0">
                      <UBadge
                        variant="subtle"
                        :color="part.state === 'complete' ? 'success' : (part.state === 'pending' ? 'info' : 'error')"
                        size="xs"
                        class="tabular-nums font-mono font-semibold shrink-0"
                      >
                        #{{ part.partNumber }}
                      </UBadge>

                      <div class="min-w-0">
                        <div class="font-medium tabular-nums text-gray-800 dark:text-gray-200 truncate">
                          {{ formatBytes(part.startByte) }} – {{ formatBytes(part.endByte) }}
                        </div>
                        <div class="text-[10px] text-gray-400">
                          {{ formatBytes(part.size) }}
                        </div>
                      </div>
                    </div>

                    <!-- Middle: Mini progress bar -->
                    <div class="hidden sm:block w-20 shrink-0">
                      <div class="h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        <div
                          class="h-full transition-all"
                          :class="part.state === 'complete' ? 'bg-emerald-500 w-full' : (part.state === 'pending' ? 'bg-blue-500 w-1/2' : 'bg-rose-500 w-0')"
                        />
                      </div>
                    </div>

                    <!-- Right: State and sources badge -->
                    <div class="flex items-center gap-2 shrink-0">
                      <UBadge
                        v-if="part.state === 'complete'"
                        color="success"
                        variant="subtle"
                        size="sm"
                        class="font-medium"
                      >
                        {{ $t('downloads.parts.statusComplete') }}
                      </UBadge>
                      <UBadge
                        v-else-if="part.state === 'pending'"
                        color="info"
                        variant="subtle"
                        size="sm"
                        class="font-medium"
                      >
                        {{ $t('downloads.parts.statusAvailable') }} ({{ $t('downloads.parts.sourcesCount', { count: part.sources }) }})
                      </UBadge>
                      <UBadge
                        v-else
                        color="error"
                        variant="subtle"
                        size="sm"
                        class="font-medium"
                      >
                        {{ $t('downloads.parts.statusUnavailable') }}
                      </UBadge>
                    </div>
                  </div>

                  <div v-if="filteredParts.length === 0" class="py-6 text-center text-xs text-gray-500">
                    {{ $t('downloads.parts.noPartsMatch') }}
                  </div>
                </div>
              </div>
            </div>

            <!-- SWARM & ACTIVITY TAB -->
            <div v-else-if="item.value === 'swarm'" class="space-y-4 pt-3">
              <!-- Swarm Health Banner -->
              <UAlert
                :color="partCounts.unavailable === 0 ? 'success' : (view.sources === 0 ? 'error' : 'warning')"
                variant="subtle"
                :icon="partCounts.unavailable === 0 ? 'i-heroicons-check-circle' : (view.sources === 0 ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-exclamation-circle')"
                :title="partCounts.unavailable === 0 ? $t('downloads.swarmDetails.healthy') : $t('downloads.swarmDetails.rare', { count: partCounts.unavailable })"
                :description="partCounts.unavailable === 0 ? $t('downloads.parts.healthySwarm') : $t('downloads.parts.incompleteSwarm', { count: partCounts.unavailable })"
              />

              <!-- Sources breakdown grid -->
              <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-elevated/40 space-y-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {{ $t('downloads.swarmDetails.sourcesBreakdown') }}
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span class="text-gray-400 block">{{ $t('downloads.swarmDetails.totalSources') }}</span>
                    <span class="text-base font-semibold tabular-nums">{{ view.sources ?? 0 }}</span>
                  </div>
                  <div>
                    <span class="text-gray-400 block">{{ $t('downloads.swarmDetails.transferring') }}</span>
                    <span class="text-base font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {{ view.sourcesXfer ?? 0 }}
                    </span>
                  </div>
                  <div>
                    <span class="text-gray-400 block">{{ $t('downloads.swarmDetails.a4af') }}</span>
                    <span class="text-base font-semibold tabular-nums">{{ view.sourcesA4AF ?? 0 }}</span>
                  </div>
                  <div>
                    <span class="text-gray-400 block">{{ $t('downloads.swarmDetails.queued') }}</span>
                    <span class="text-base font-semibold tabular-nums">{{ view.sourcesNotCurrent ?? 0 }}</span>
                  </div>
                </div>
              </div>

              <!-- Technical & Timing Facts -->
              <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-elevated/40 space-y-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {{ $t('downloads.swarmDetails.timingTitle') }}
                </div>
                <dl class="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt class="text-gray-400">{{ $t('downloads.swarmDetails.partsAvailable') }}</dt>
                    <dd class="font-medium mt-0.5">{{ view.availableParts ?? partCounts.complete + partCounts.pending }} / {{ effectiveParts.length }}</dd>
                  </div>
                  <div>
                    <dt class="text-gray-400">{{ $t('downloads.fields.lastReceived') }}</dt>
                    <dd class="font-medium mt-0.5">{{ formatTimestamp(view.lastReceived) }}</dd>
                  </div>
                  <div>
                    <dt class="text-gray-400">{{ $t('downloads.fields.lastSeenComplete') }}</dt>
                    <dd class="font-medium mt-0.5">{{ formatTimestamp(view.lastSeenComplete) }}</dd>
                  </div>
                  <div>
                    <dt class="text-gray-400">{{ view.startKnown ? $t('downloads.fields.addedAt') : $t('downloads.fields.seenSince') }}</dt>
                    <dd class="font-medium mt-0.5">{{ time.dateTime(view.startKnown ? view.addedAt : view.firstSeenAt) }}</dd>
                  </div>
                  <div>
                    <dt class="text-gray-400">{{ view.completedAt ? $t('downloads.fields.completedAt') : $t('downloads.fields.runningFor') }}</dt>
                    <dd class="font-medium mt-0.5">
                      {{ view.completedAt ? time.dateTime(view.completedAt) : (time.duration(view.addedAt ?? view.firstSeenAt, Date.now()) || '-') }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-gray-400">{{ $t('downloads.parts.partSize') }}</dt>
                    <dd class="font-medium mt-0.5">9.28 MiB (9,728,000 B)</dd>
                  </div>
                </dl>
              </div>

              <!-- On disk and integrity: only amuleapi reports these -->
              <div v-if="fileFacts.length" class="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-elevated/40 space-y-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {{ $t('downloads.detail.fileTitle') }}
                </div>
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div v-for="fact in fileFacts" :key="fact.label" class="min-w-0">
                    <dt class="text-gray-400">{{ fact.label }}</dt>
                    <dd class="font-medium mt-0.5 break-all" :class="fact.mono ? 'font-mono' : ''">{{ fact.value }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>

    <template #footer>
      <!-- Stacks into full width rows on a phone, where four wrapped buttons of
           different widths are hard to hit; side by side from sm up -->
      <div v-if="view" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
        <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <UButton
            :icon="isPaused ? 'i-heroicons-play' : 'i-heroicons-pause'"
            :loading="busyHash === view.hash"
            variant="outline"
            block
            class="sm:w-auto"
            @click="() => { isPaused ? resume(view!) : pause(view!) }"
          >
            {{ isPaused ? $t('downloads.resume') : $t('downloads.pause') }}
          </UButton>

          <USelect
            :model-value="view.priority"
            :items="priorities"
            value-key="value"
            label-key="label"
            :disabled="busyHash === view.hash"
            icon="i-heroicons-arrow-up"
            class="w-full sm:w-32"
            :aria-label="$t('downloads.fields.priority')"
            @update:model-value="value => setPriority(view!, value as any)"
          />
        </div>

        <div class="flex gap-2 w-full sm:w-auto">
          <UButton
            color="error"
            variant="soft"
            icon="i-heroicons-trash"
            class="flex-1 sm:flex-none justify-center"
            @click="emit('remove', view)"
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
import { computed, ref, watch } from 'vue';
import type { Download, DownloadPart } from '../../server/utils/amule-types';
import { classifyDownload } from '#shared/utils/downloadHealth';
import { formatBytes, formatPercent, formatSeconds, formatSpeed, formatTimestamp } from '#shared/utils/format';
import {
  countParts,
  getDetailedParts,
  synthesizePartsFromDownload,
  type DetailedDownloadPart
} from '../utils/partBar';
import { mergeDownloadDetail, remainingSeconds } from '../utils/downloadDetail';
import { mediaFactList } from '../utils/media';
import { MODAL_TRANSITION_UI, ACTIVE_TRANSITION_NAME } from '../composables/useViewTransition';

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
const { getDownload } = useAmuleApi();

const activeTab = ref('overview');
const activePartIndex = ref<number | null>(null);
const partFilter = ref<'all' | 'complete' | 'pending' | 'unavailable'>('all');
const partSearch = ref('');

/**
 * The detail reading of the open download: `undefined` while loading, `null`
 * when the server could not answer. Over amuleapi (aMule 3.1) it carries the
 * part map, the daemon's ETA, media and on-disk facts; over EC it is the queue
 * entry again, and the part bar falls back to an estimate.
 */
const detail = ref<Download | null | undefined>();

/** How often the detail is re-read while the modal is open. */
const DETAIL_REFRESH_MS = 10_000;

async function refreshDetail(hash: string, signal: AbortSignal) {
  try {
    const response = await getDownload(hash, { signal });
    if (signal.aborted) return;
    detail.value = response.success ? response.data ?? null : null;
  } catch (error: any) {
    if (signal.aborted || error?.name === 'AbortError') return;
    detail.value = null;
  }
}

/**
 * Loads the detail only while the modal is open, instead of making the whole
 * queue carry it on every poll: a download no one is looking at needs no map.
 */
watch([open, () => props.download?.hash], ([isOpen, hash]) => {
  detail.value = undefined;
  activePartIndex.value = null;
  partSearch.value = '';
  partFilter.value = 'all';
  if (!isOpen || !hash) return;

  const controller = new AbortController();
  refreshDetail(hash, controller.signal);

  const interval = setInterval(() => refreshDetail(hash, controller.signal), DETAIL_REFRESH_MS);
  onWatcherCleanup(() => {
    controller.abort();
    clearInterval(interval);
  });
});

/** The live queue entry plus what only the detail knows. */
const view = computed(() => mergeDownloadDetail(props.download, detail.value));

/** The real part map, when amuleapi sent one. */
const partMap = computed<DownloadPart[] | null | undefined>(() =>
  detail.value === undefined ? undefined : detail.value?.parts ?? null);

/**
 * Uses live amuleapi chunk map when present, or synthesizes based on EC
 * download progress so a classic aMule bar is always available.
 */
const effectiveParts = computed<DownloadPart[]>(() => {
  if (partMap.value && partMap.value.length > 0) {
    return partMap.value;
  }
  if (view.value) {
    return synthesizePartsFromDownload(view.value);
  }
  return [];
});

const isPartsEstimated = computed(() => {
  return !partMap.value && effectiveParts.value.length > 0;
});

const partCounts = computed(() => countParts(effectiveParts.value));

const detailedParts = computed<DetailedDownloadPart[]>(() => {
  if (!view.value) return [];
  return getDetailedParts(view.value.size, effectiveParts.value);
});

const filteredParts = computed(() => {
  let list = detailedParts.value;
  if (partFilter.value !== 'all') {
    list = list.filter(p => p.state === partFilter.value);
  }
  if (partSearch.value.trim()) {
    const q = partSearch.value.trim().toLowerCase();
    list = list.filter(p =>
      String(p.partNumber).includes(q) ||
      p.state.toLowerCase().includes(q) ||
      formatBytes(p.startByte).toLowerCase().includes(q) ||
      formatBytes(p.endByte).toLowerCase().includes(q)
    );
  }
  return list;
});

const swarmAvailabilityPercent = computed(() => {
  if (effectiveParts.value.length === 0) return 0;
  const available = partCounts.value.complete + partCounts.value.pending;
  return Math.min(100, Math.round((available / effectiveParts.value.length) * 100));
});

/*
 * No `slot` on the items: with one, UTabs renders a slot of that name instead
 * of #content, and the panels came out empty.
 */
const tabs = computed(() => [
  { label: t('downloads.tabs.overview'), icon: 'i-heroicons-information-circle', value: 'overview' },
  {
    label: `${t('downloads.tabs.parts')} (${effectiveParts.value.length})`,
    icon: 'i-heroicons-rectangle-group',
    value: 'parts'
  },
  { label: t('downloads.tabs.swarm'), icon: 'i-heroicons-signal', value: 'swarm' }
]);

function onSelectPartFromBar(index: number) {
  activePartIndex.value = index;
  activeTab.value = 'parts';
  partFilter.value = 'all';
  partSearch.value = String(index + 1);
}

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

const info = computed(() => classifyDownload(view.value ?? {}));
const isPaused = computed(() => view.value?.status === 'Paused' || view.value?.stopped === true);

/** amuleapi's own ETA when it sent one, otherwise bytes left over speed. */
const factsEta = computed(() => (view.value ? formatSeconds(remainingSeconds(view.value)) : null) ?? '-');

/** On-disk and integrity facts. amuleapi only, so each appears when it is known. */
const fileFacts = computed(() => {
  const download = view.value;
  if (!download) return [];

  const facts: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (download.directory) facts.push({ label: t('downloads.detail.directory'), value: download.directory, mono: true });
  if (download.partFileName) facts.push({ label: t('downloads.detail.partFile'), value: download.partFileName, mono: true });
  if (download.activeSeconds !== undefined) facts.push({ label: t('downloads.detail.activeTime'), value: formatSeconds(download.activeSeconds) ?? '-' });
  if (download.lostToCorruptionBytes !== undefined) facts.push({ label: t('downloads.detail.lostToCorruption'), value: formatBytes(download.lostToCorruptionBytes) });
  if (download.gainedByCompressionBytes !== undefined) facts.push({ label: t('downloads.detail.gainedByCompression'), value: formatBytes(download.gainedByCompressionBytes) });
  if (download.ichRecoveredPackets !== undefined) facts.push({ label: t('downloads.detail.ichRecovered'), value: download.ichRecoveredPackets.toLocaleString() });
  if (download.uploadQueueCount !== undefined) facts.push({ label: t('downloads.detail.uploadQueue'), value: download.uploadQueueCount.toLocaleString() });
  if (download.aichHash !== undefined) {
    facts.push(download.aichHash
      ? { label: t('downloads.detail.aichHash'), value: download.aichHash, mono: true }
      : { label: t('downloads.detail.aichHash'), value: t('downloads.detail.aichPending') });
  }
  return facts;
});

/** What amuled probed about the media, when it is a media file. */
const mediaFacts = computed(() => mediaFactList(view.value?.media, t));

const facts = computed(() => {
  const download = view.value;
  if (!download) return [];

  const remaining = Math.max(0, (download.size || 0) - (download.sizeDone || 0));
  const eta = factsEta.value;

  return [
    { label: t('downloads.fields.status'), value: t(info.value.labelKey) },
    { label: t('downloads.fields.speed'), value: formatSpeed(download.speed) },
    { label: t('downloads.fields.eta'), value: eta },
    { label: t('downloads.fields.size'), value: formatBytes(download.size) },
    { label: t('downloads.fields.remaining'), value: formatBytes(remaining) },
    { label: t('downloads.fields.priority'), value: `${t('downloads.priorities.' + download.priority)}${download.autoPriority ? ' ' + t('downloads.priorities.autoSuffix') : ''}` },
    { label: t('downloads.fields.sources'), value: String(download.sources ?? 0) },
    { label: t('downloads.fields.transferring'), value: String(download.sourcesXfer ?? 0) },
    { label: t('downloads.fields.a4afSources'), value: String(download.sourcesA4AF ?? 0) },
    { label: t('downloads.fields.availableParts'), value: String(download.availableParts ?? 0) },
    { label: t('downloads.fields.lastReceived'), value: formatTimestamp(download.lastReceived) },
    { label: t('downloads.fields.lastSeenComplete'), value: formatTimestamp(download.lastSeenComplete) },
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
