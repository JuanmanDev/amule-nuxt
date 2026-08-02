<template>
  <UButton
    color="neutral"
    variant="ghost"
    aria-label="Toggle color scheme"
    @click="toggleColorScheme"
  >
    <!--
      Both icons are rendered and CSS picks one.

      The server cannot know the visitor's colour scheme, so choosing the icon
      from `colorMode` in the markup made every page hydrate with a class
      mismatch ("Hydration completed but contains mismatches"). The `dark` class
      lands on <html> before the first paint, so this shows the right icon
      immediately - earlier than a client-only render would.
    -->
    <UIcon name="i-heroicons-sun-20-solid" class="size-5 dark:hidden" />
    <UIcon name="i-heroicons-moon-20-solid" class="size-5 hidden dark:block" />
  </UButton>
</template>

<script setup lang="ts">
const colorMode = useColorMode()

function toggleColorScheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>
