<!--
  The classic aMule part bar: green for downloaded parts, blue for available
  parts in the swarm, and red for missing parts nobody offers. (Outside
  <template> so the root stays a single element, not a comment + div fragment.)
-->
<template>
  <div v-if="segments.length" class="space-y-2">
    <!-- Classic aMule Part Bar frame -->
    <div
      class="p-1 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 shadow-inner"
      role="img"
      :aria-label="ariaLabel"
    >
      <div class="flex gap-px h-5 sm:h-6 rounded overflow-hidden bg-gray-200 dark:bg-gray-800">
        <div
          v-for="(segment, index) in segments"
          :key="index"
          class="flex-1 min-w-0 transition-all cursor-pointer hover:opacity-90 hover:scale-y-105"
          :class="[
            SEGMENT_STYLES[segment.state],
            activePartIndex === index ? 'ring-2 ring-primary ring-inset brightness-125' : ''
          ]"
          :title="getSegmentTooltip(segment, index)"
          @click="emit('selectPart', index)"
        />
      </div>
    </div>

    <!-- Classic aMule Legend & Stats -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div class="flex flex-wrap items-center gap-2">
        <!-- Complete (Classic Green) -->
        <UBadge color="success" variant="subtle" size="sm" class="flex items-center gap-1 font-medium">
          <span class="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          {{ $t('downloads.partBar.legend.complete') }}:
          <span class="tabular-nums font-semibold">{{ counts.complete }}</span>
          <span v-if="total > 0" class="text-[10px] opacity-75">({{ Math.round((counts.complete / total) * 100) }}%)</span>
        </UBadge>

        <!-- Available in Swarm (Classic Blue) -->
        <UBadge color="info" variant="subtle" size="sm" class="flex items-center gap-1 font-medium">
          <span class="inline-block w-2 h-2 rounded-full bg-blue-500" />
          {{ $t('downloads.partBar.legend.pending') }}:
          <span class="tabular-nums font-semibold">{{ counts.pending }}</span>
          <span v-if="total > 0" class="text-[10px] opacity-75">({{ Math.round((counts.pending / total) * 100) }}%)</span>
        </UBadge>

        <!-- Missing / No Source (Classic Red) -->
        <UBadge color="error" variant="subtle" size="sm" class="flex items-center gap-1 font-medium">
          <span class="inline-block w-2 h-2 rounded-full bg-rose-500" />
          {{ $t('downloads.partBar.legend.unavailable') }}:
          <span class="tabular-nums font-semibold">{{ counts.unavailable }}</span>
          <span v-if="total > 0 && counts.unavailable > 0" class="text-[10px] opacity-75">({{ Math.round((counts.unavailable / total) * 100) }}%)</span>
        </UBadge>
      </div>

      <div class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span v-if="isEstimated" class="inline-flex items-center gap-1">
          <UIcon name="i-heroicons-calculator" class="text-amber-500" />
          {{ $t('downloads.parts.estimatedBadge') }}
        </span>
        <span v-else class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {{ $t('downloads.parts.liveBadge') }}
        </span>

        <span v-if="bucketed" class="italic">
          {{ $t('downloads.partBar.bucketed', { segments: segments.length, parts: total }) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DownloadPart, DownloadPartState } from '../../server/utils/amule-types';
import { buildSegments, countParts, PART_BAR_MAX_SEGMENTS, type PartSegment } from '../utils/partBar';

const props = defineProps<{
  parts?: DownloadPart[] | null;
  fileSize?: number;
  isEstimated?: boolean;
  activePartIndex?: number | null;
}>();

const emit = defineEmits<{
  selectPart: [index: number];
}>();

const { t } = useI18n();

const SEGMENT_STYLES: Record<DownloadPartState, string> = {
  // Downloaded and verified on disk (Classic aMule Green)
  complete: 'bg-emerald-500 dark:bg-emerald-500',
  // Missing, but at least one source in the swarm offers it (Classic aMule Blue)
  pending: 'bg-blue-600 dark:bg-blue-500',
  // Missing and nobody seen with it (Classic aMule Red)
  unavailable: 'bg-rose-500 dark:bg-rose-600'
};

const total = computed(() => props.parts?.length ?? 0);
const segments = computed(() => buildSegments(props.parts));
const counts = computed(() => countParts(props.parts));
const bucketed = computed(() => total.value > PART_BAR_MAX_SEGMENTS);

function getSegmentTooltip(segment: PartSegment, index: number): string {
  const stateLabel = t(`downloads.partBar.legend.${segment.state}`);
  if (bucketed.value) {
    return t(`downloads.partBar.tooltips.${segment.state}`, { count: segment.parts });
  }
  return `${t('downloads.parts.partNumber', { number: index + 1 })}: ${stateLabel}`;
}

const ariaLabel = computed(() =>
  t('downloads.partBar.ariaLabel', {
    complete: counts.value.complete,
    pending: counts.value.pending,
    unavailable: counts.value.unavailable,
    total: total.value
  })
);
</script>
