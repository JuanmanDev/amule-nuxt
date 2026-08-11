<template>
  <UButton
    :size="size"
    :variant="variant"
    color="neutral"
    icon="i-heroicons-clipboard"
    :loading="pasting"
    :aria-label="label ?? $t('addLinks.paste')"
    :title="label ?? $t('addLinks.paste')"
    @click="paste"
  >
    <!-- Label only where there is room for it -->
    <span v-if="showLabel" class="hidden sm:inline">{{ label ?? $t('addLinks.paste') }}</span>
  </UButton>
</template>

<script setup lang="ts">
/**
 * Pastes the clipboard into a field. Used by every place that takes a link, so
 * the behaviour and the error handling are the same everywhere.
 *
 * The clipboard read needs a user gesture and a permission the browser may
 * refuse (and it is unavailable on insecure origins), which is why the failure
 * is reported instead of silently doing nothing.
 */
const props = withDefaults(defineProps<{
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link';
  showLabel?: boolean;
}>(), {
  label: undefined,
  size: 'sm',
  variant: 'outline',
  showLabel: true
});

const emit = defineEmits<{ paste: [text: string] }>();

const toast = useToast();
const { t } = useI18n();
const pasting = ref(false);

async function paste() {
  pasting.value = true;
  try {
    const text = await navigator.clipboard.readText();
    const trimmed = text.trim();

    if (!trimmed) {
      toast.add({ title: t('addLinks.clipboardEmpty'), color: 'warning' });
      return;
    }

    emit('paste', trimmed);
  } catch {
    toast.add({
      title: 'Could not read the clipboard',
      description: 'The browser refused access. Paste with Ctrl+V instead.',
      color: 'warning'
    });
  } finally {
    pasting.value = false;
  }
}
</script>
