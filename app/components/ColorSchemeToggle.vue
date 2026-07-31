<template>
  <UButton
    :icon="isDark ? 'i-heroicons-moon-20-solid' : 'i-heroicons-sun-20-solid'"
    color="neutral"
    variant="ghost"
    aria-label="Toggle color scheme"
    @click="toggleColorScheme"
  />
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggleColorScheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>
