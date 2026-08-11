<!--
  What the selection adds up to.

  The point of picking twenty downloads is usually a question about them together
  - how much is left, how fast is this going, how much have I sent - and that is
  a question no per-row view can answer. The caller works out the facts, since
  only it knows what its rows mean; this renders them and offers the links.
-->
<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-2xl' }" :title="$t('selection.totalsTitle')">
    <template #body>
      <div class="space-y-6">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ $t('selection.totalsIntro', { count: count.toLocaleString() }, count) }}
        </p>

        <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div v-for="fact in facts" :key="fact.label" class="min-w-0">
            <dt class="text-xs text-gray-500 dark:text-gray-400">{{ fact.label }}</dt>
            <dd class="font-medium break-words">{{ fact.value }}</dd>
          </div>
        </dl>

        <!-- Every selected file's link, ready to paste into another client. Shown
             rather than only copied, because a clipboard write can be refused on
             a plain-HTTP origin and then there is nothing to fall back on. -->
        <div v-if="links.length > 0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ $t('selection.linksLabel', { count: links.length.toLocaleString() }, links.length) }}
            </div>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-clipboard-document"
              @click="copyLinks"
            >
              {{ $t('selection.copyLinks') }}
            </UButton>
          </div>
          <UTextarea
            :model-value="linkText"
            :rows="6"
            readonly
            class="w-full font-mono"
            :ui="{ base: 'text-xs' }"
          />
        </div>

        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-heroicons-information-circle"
          :description="$t('selection.noLinks')"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <UButton color="neutral" variant="ghost" @click="() => { open = false }">
          {{ $t('common.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  /** How many rows the selection holds. */
  count: number;
  /** Label/value pairs the calling page worked out. */
  facts: Array<{ label: string; value: string }>;
  /** ed2k links for the selected files, where they have one. */
  links: string[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});

const { copy } = useClipboard();
const { t } = useI18n();

const linkText = computed(() => props.links.join('\n'));

function copyLinks() {
  copy(linkText.value, t('selection.linksCopied', { count: props.links.length }, props.links.length));
}
</script>
