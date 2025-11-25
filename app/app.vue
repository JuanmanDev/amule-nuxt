<template>
  <UApp>
    <!-- Desktop Navigation - Top Bar -->
    <header class="hidden lg:block sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <UContainer>
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-xl">
            <UIcon name="i-heroicons-server" class="w-6 h-6" />
            aMule Nuxt
          </NuxtLink>

          <!-- Navigation Links -->
          <NavigationMenu :links="navLinks" orientation="horizontal" />
        </div>
      </UContainer>
    </header>

    <!-- Main Content -->
    <UMain class="pb-32 lg:pb-0">
      <UContainer class="py-8">
        <NuxtPage />
      </UContainer>
    </UMain>

    <!-- Footer -->
    <footer class="hidden lg:block border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <UContainer>
        <div class="flex items-center justify-between h-16">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            © {{ new Date().getFullYear() }} aMule Nuxt. All rights reserved.
          </p>
          <div class="flex items-center gap-2">
            <ColorSchemeToggle />
            <UButton
              icon="i-simple-icons-github"
              color="gray"
              variant="ghost"
              to="https://github.com/yourusername/amule-nuxt"
              target="_blank"
              aria-label="GitHub Repository"
            />
          </div>
        </div>
      </UContainer>
    </footer>



    <!-- Mobile Navigation - Bottom Bar (Fixed) -->
    <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div class="grid grid-cols-4 h-16">
        <NuxtLink
          v-for="link in mobileNavLinks"
          :key="link.to"
          :to="link.to"
          class="flex flex-col items-center justify-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          active-class="text-primary-600 dark:text-primary-400"
        >
          <UIcon :name="link.icon" class="w-6 h-6" />
          <span class="text-xs">{{ link.label }}</span>
        </NuxtLink>
        
        <!-- Menu Button -->
        <button
          @click="isMenuOpen = true"
          class="flex flex-col items-center justify-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <UIcon name="i-heroicons-bars-3" class="w-6 h-6" />
          <span class="text-xs">Menu</span>
        </button>
      </div>
    </nav>

    <!-- Mobile Menu Slideover -->
    <USlideover title="aMule Nuxt" v-model:open="isMenuOpen" side="right">
      <template #body>
        <!-- Speed Summary in Menu -->
        <div class="flex items-center justify-around text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <UIcon name="i-heroicons-arrow-down" class="w-5 h-5" />
            <span class="font-medium">{{ status ? formatSpeed(status.downloadSpeed) : '0 KB/s' }}</span>
          </div>
          <div class="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
          <div class="flex items-center gap-2 text-green-600 dark:text-green-400">
            <UIcon name="i-heroicons-arrow-up" class="w-5 h-5" />
            <span class="font-medium">{{ status ? formatSpeed(status.uploadSpeed) : '0 KB/s' }}</span>
          </div>
        </div>

        <NavigationMenu 
          :links="navLinks" 
          orientation="vertical" 
          @click="isMenuOpen = false" 
        />

        <div class="flex items-center justify-between">
          <UButton icon="i-simple-icons-github" color="gray" variant="ghost" to="https://github.com/yourusername/amule-nuxt" target="_blank" aria-label="GitHub" />
          <UButton
            :icon="isDark ? 'i-heroicons-moon-20-solid' : 'i-heroicons-sun-20-solid'"
            color="gray"
            variant="ghost"
            @click="toggleTheme"
            aria-label="Toggle theme"
          />
        </div>
      </template>
    </USlideover>
  </UApp>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const isMenuOpen = ref(false)
const status = ref<any>(null)

// Navigation links for desktop and mobile menu
const navLinks = [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/' },
  { label: 'Downloads', icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { label: 'Search', icon: 'i-heroicons-magnifying-glass', to: '/search' },
  { label: 'Shared', icon: 'i-heroicons-folder-open', to: '/shared' },
  { label: 'Servers', icon: 'i-heroicons-server-stack', to: '/servers' },
  { label: 'Stats', icon: 'i-heroicons-chart-bar', to: '/stats' },
  { label: 'Logs', icon: 'i-heroicons-document-text', to: '/logs' },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
]

// Simplified navigation for mobile (3 pages + menu)
const mobileNavLinks = [
  { label: 'Home', icon: 'i-heroicons-home', to: '/' },
  { label: 'Downloads', icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { label: 'Shared', icon: 'i-heroicons-folder-open', to: '/shared' }
]

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

async function fetchStatus() {
  try {
    const result = await $fetch('/api/amule/status')
    if (result.success) {
      status.value = result.data
    }
  } catch (e) {
    // Ignore errors
  }
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`
  }
  return `${kbps.toFixed(1)} KB/s`
}

onMounted(() => {
  fetchStatus()
  // Refresh status every 5 seconds
  setInterval(fetchStatus, 5000)
})

// SEO
useHead({
  titleTemplate: '%s - aMule Nuxt'
})
</script>
<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.2s;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  filter: blur(1rem);
}
</style>