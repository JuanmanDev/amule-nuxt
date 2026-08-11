<!--
  Picks the interface language from the ones aMule itself is translated into.

  The choice is written to a cookie rather than kept in memory, so the *server*
  already renders the right language on the next request: with 38 languages, a
  page that arrives in English and switches a moment later is a visible flash on
  every single navigation.
-->
<template>
  <UDropdownMenu :items="[items]" :modal="false">
    <UButton
      icon="i-heroicons-language"
      color="neutral"
      variant="ghost"
      :aria-label="$t('app.language')"
      :title="$t('app.language')"
    >
      <span class="hidden sm:inline">{{ currentName }}</span>
    </UButton>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

const { locale, locales, setLocale } = useI18n();

const currentName = computed(() =>
  locales.value.find(entry => entry.code === locale.value)?.name ?? locale.value
);

const items = computed<DropdownMenuItem[]>(() => locales.value.map(entry => ({
  label: entry.name ?? entry.code,
  // A tick beside the active one, and each language written in itself so it can
  // be found by someone who cannot read the current interface language
  icon: entry.code === locale.value ? 'i-heroicons-check' : undefined,
  onSelect: () => setLocale(entry.code)
})));
</script>
