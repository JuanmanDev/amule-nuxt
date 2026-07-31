<template>
  <div class="space-y-2">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="w-full h-40"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`Upload and download rate over the last ${minutesSpan} minutes`"
    >
      <!-- Grid -->
      <line
        v-for="fraction in [0.25, 0.5, 0.75]"
        :key="fraction"
        :x1="0"
        :x2="WIDTH"
        :y1="HEIGHT * fraction"
        :y2="HEIGHT * fraction"
        class="stroke-gray-200 dark:stroke-gray-800"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />

      <!-- Filled areas plus lines; the `d` values are tweened, which makes the
           chart glide between samples instead of jumping -->
      <path :d="downloadArea" class="fill-blue-500/15" />
      <path :d="uploadArea" class="fill-green-500/15" />
      <path
        :d="downloadLine"
        fill="none"
        class="stroke-blue-500"
        stroke-width="1.5"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
      <path
        :d="uploadLine"
        fill="none"
        class="stroke-green-500"
        stroke-width="1.5"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-1 rounded bg-green-500" /> Upload
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-1 rounded bg-blue-500" /> Download
        </span>
      </span>
      <span>Scale {{ formatSpeed(scale) }} &middot; {{ samples.length }} samples over {{ minutesSpan }} min</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Sparkline for the transfer rates.
 *
 * Values are animated: on every data change the rendered series is tweened from
 * the previous one with requestAnimationFrame, so the line moves smoothly rather
 * than snapping to the new sample. SVG cannot transition a `d` attribute on its
 * own, hence the manual interpolation.
 */
import { formatSpeed } from '#shared/utils/format';

interface Sample {
    upload: number;
    download: number;
}

const props = withDefaults(defineProps<{
  samples: Sample[];
  minutesSpan?: number;
  /** Tween duration in milliseconds. */
  transition?: number;
}>(), {
  minutesSpan: 30,
  transition: 600
});

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 4;

/** Series currently drawn, interpolated towards props.samples. */
const drawn = ref<Sample[]>([...props.samples]);
let frame: number | undefined;

const scale = computed(() => {
  const peak = Math.max(
    ...drawn.value.map(sample => Math.max(sample.upload, sample.download)),
    1
  );
  // Round the axis up so small changes do not rescale the whole chart
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
});

function buildPath(pick: (sample: Sample) => number, close: boolean): string {
    const list = drawn.value;
    if (list.length < 2) return '';

    const stepX = (WIDTH - PADDING * 2) / (list.length - 1);
    const points = list.map((sample, index) => {
        const x = PADDING + index * stepX;
        const y = HEIGHT - PADDING - (pick(sample) / scale.value) * (HEIGHT - PADDING * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const line = `M ${points.join(' L ')}`;
    return close
        ? `${line} L ${(WIDTH - PADDING).toFixed(2)},${HEIGHT - PADDING} L ${PADDING},${HEIGHT - PADDING} Z`
        : line;
}

const uploadLine = computed(() => buildPath(sample => sample.upload, false));
const downloadLine = computed(() => buildPath(sample => sample.download, false));
const uploadArea = computed(() => buildPath(sample => sample.upload, true));
const downloadArea = computed(() => buildPath(sample => sample.download, true));

/** Resamples a series to `length` points so two series can be interpolated. */
function resample(series: Sample[], length: number): Sample[] {
    if (series.length === 0) return Array.from({ length }, () => ({ upload: 0, download: 0 }));
    if (series.length === length) return series;

    return Array.from({ length }, (_, index) => {
        const position = (index / Math.max(1, length - 1)) * (series.length - 1);
        const low = Math.floor(position);
        const high = Math.min(series.length - 1, low + 1);
        const ratio = position - low;

        return {
            upload: series[low]!.upload + (series[high]!.upload - series[low]!.upload) * ratio,
            download: series[low]!.download + (series[high]!.download - series[low]!.download) * ratio
        };
    });
}

function animateTo(target: Sample[]) {
    if (frame) cancelAnimationFrame(frame);

    const length = target.length;
    const from = resample(drawn.value, length);
    const start = performance.now();

    const step = (now: number) => {
        const progress = Math.min(1, (now - start) / props.transition);
        // ease-out so the line settles instead of stopping abruptly
        const eased = 1 - (1 - progress) ** 3;

        drawn.value = target.map((sample, index) => ({
            upload: from[index]!.upload + (sample.upload - from[index]!.upload) * eased,
            download: from[index]!.download + (sample.download - from[index]!.download) * eased
        }));

        if (progress < 1) {
            frame = requestAnimationFrame(step);
        } else {
            frame = undefined;
            drawn.value = [...target];
        }
    };

    frame = requestAnimationFrame(step);
}

watch(() => props.samples, samples => {
  if (samples.length < 2) {
    drawn.value = [...samples];
    return;
  }
  animateTo([...samples]);
}, { deep: true });

onUnmounted(() => {
  if (frame) cancelAnimationFrame(frame);
});
</script>
