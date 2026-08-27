<template>
  <UModal
    v-model:open="isOpen"
    :title="$t('app.addEd2kLink')"
    :ui="{ content: 'w-full max-w-[95%] sm:max-w-[1000px]', wrapper: 'z-[100]' }"
  >
    <template #body>
      <!-- After submitting, show what happened to each link -->
      <div v-if="results.length > 0" class="space-y-4">
        <UAlert
          :color="summary.color"
          variant="subtle"
          :icon="summaryIcon"
          :title="summary.title"
          :description="summary.description"
        />

        <TransitionGroup tag="div" name="list" class="max-h-60 overflow-y-auto space-y-2 relative">
          <div
            v-for="(result, index) in results"
            :key="index"
            class="flex items-start gap-2 p-2 rounded bg-elevated/50 backdrop-blur-sm"
          >
            <UIcon
              :name="statusIcon(result.status)"
              :class="statusClass(result.status)"
              class="w-5 h-5 shrink-0 mt-0.5"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate" :title="result.link">
                {{ result.existingName || result.link }}
              </p>
              <p class="text-xs mt-0.5" :class="statusClass(result.status)">{{ result.message }}</p>
            </div>
          </div>
        </TransitionGroup>

        <div class="flex justify-end gap-2 pt-2 mt-4 border-t border-gray-200 dark:border-gray-700">
          <UButton color="neutral" variant="ghost" @click="reset">{{ $t('addLinks.addMore') }}</UButton>
          <UButton color="primary" @click="closeAndRedirect">{{ $t('selection.done') }}</UButton>
        </div>
      </div>

      <form v-else @submit.prevent="submit">
        <UFormField
          :label="$t('addLinks.modalLabel')"
          name="links"
          help="Links already in aMule are reported instead of silently merged."
        >
          <UTextarea
            v-model="linksText"
            :rows="12"
            :placeholder="$t('addLinks.placeholder')"
            autoresize
            class="w-full"
          />
        </UFormField>

        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <!-- Offered while the field is empty, which is when it is useful -->
          <PasteButton v-if="!linksText" class="me-auto" @paste="onPaste" />
          <UButton color="neutral" variant="ghost" @click="() => { isOpen = false }">{{ $t('common.cancel') }}</UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="submitting"
            :disabled="!linksText.trim()"
            icon="i-heroicons-plus"
          >
            Add links
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * Batch add dialog. It shares the add logic with the pages through
 * useDownloads().addLinks, and only adds the per-link listing on top.
 */
import type { AddLinkResult, AddLinkStatus } from '#shared/types/api';
import { splitLinks, summariseAddResults } from '#shared/utils/addLinks';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});

const router = useRouter();
const { addLinks } = useDownloads();

const linksText = ref('');
const submitting = ref(false);
const results = ref<AddLinkResult[]>([]);

const summary = computed(() => summariseAddResults({
  results: results.value,
  added: results.value.filter(result => result.status === 'added').length,
  duplicates: results.value.filter(result => result.status === 'duplicate').length,
  rejected: results.value.filter(result => result.status === 'rejected').length
}));

const summaryIcon = computed(() => summary.value.color === 'success'
  ? 'i-heroicons-check-circle'
  : summary.value.color === 'warning'
    ? 'i-heroicons-exclamation-triangle'
    : 'i-heroicons-x-circle');

const statusIcon = (status: AddLinkStatus) => status === 'added'
  ? 'i-heroicons-check-circle'
  : status === 'duplicate'
    ? 'i-heroicons-document-duplicate'
    : 'i-heroicons-x-circle';

const statusClass = (status: AddLinkStatus) => status === 'added'
  ? 'text-green-600 dark:text-green-400'
  : status === 'duplicate'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';

function reset() {
  results.value = [];
  linksText.value = '';
}

/** Appends pasted text so several pastes build a batch. */
function onPaste(text: string) {
  linksText.value = linksText.value.trim() ? `${linksText.value.trimEnd()}\n${text}` : text;
}

function closeAndRedirect() {
  isOpen.value = false;
  router.push('/downloads');
}

async function submit() {
  const links = splitLinks(linksText.value);
  if (links.length === 0) return;

  submitting.value = true;
  try {
    const outcome = await addLinks(links);
    results.value = outcome.results;

    if (outcome.ok && outcome.summary.anyAdded) {
      reset();
      closeAndRedirect();
    }
  } finally {
    submitting.value = false;
  }
}

watch(isOpen, open => {
  if (!open) {
    // Let the closing animation finish before clearing the dialog
    setTimeout(reset, 300);
  }
});
</script>
