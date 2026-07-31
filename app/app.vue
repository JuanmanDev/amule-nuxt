<template>
  <UApp :scroll-body="false">
    <!-- Reacts to real traffic: stronger glow and more drift the busier the daemon -->
    <ActivityBackground
      :upload-speed="status?.uploadSpeed ?? 0"
      :download-speed="status?.downloadSpeed ?? 0"
      :upload-files="status?.queuedClients ?? 0"
      :download-files="activeDownloadFiles"
    />
    <UBanner
      v-if="!connectionState.connected"
      color="error"
      icon="i-heroicons-exclamation-triangle"
      :title="`Cannot reach the aMule daemon: ${connectionState.error || 'check the host, port and password'}`"
      :actions="[{ label: 'Open settings', to: '/settings', color: 'neutral', variant: 'outline', size: 'xs' }]"
    />
    <!-- Desktop Navigation - Top Bar -->
    <header class="hidden lg:block sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <UContainer>
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-xl">
            <UIcon name="i-heroicons-server" class="w-6 h-6" />
            aMule Nuxt
          </NuxtLink>

          <!-- Navigation Links: primary inline, the rest in a menu -->
          <div class="flex items-center gap-2 min-w-0">
            <NavigationMenu :links="primaryNavLinks" orientation="horizontal" />
            <UDropdownMenu :items="[secondaryNavItems]" :modal="false">
              <UButton variant="ghost" color="neutral" trailing-icon="i-heroicons-chevron-down">
                More
              </UButton>
            </UDropdownMenu>
            <UButton icon="i-heroicons-plus" color="primary" variant="solid" @click="() => { isAddModalOpen = true }">
              Add Link
            </UButton>
          </div>
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
              color="neutral"
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
          @click="() => { isMenuOpen = true }"
          class="flex flex-col items-center justify-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <UIcon name="i-heroicons-bars-3" class="w-6 h-6" />
          <span class="text-xs">Menu</span>
        </button>
      </div>
    </nav>

    <!-- Mobile Menu Slideover -->
    <USlideover title="aMule Nuxt" v-model:open="isMenuOpen" side="right">
      <template #body class="flex flex-col justify-end ">
        <!-- Speed Summary in Menu -->
        <div class="flex items-center justify-around text-sm p-2 bg-elevated/50 backdrop-blur-sm rounded-lg">
          <!-- Speeds are shortcuts to the page that explains them -->
          <NuxtLink
            to="/downloads"
            class="flex items-center gap-2 text-blue-600 dark:text-blue-400"
            @click="() => { isMenuOpen = false }"
          >
            <UIcon name="i-heroicons-arrow-down" class="w-5 h-5" />
            <AnimatedValue class="font-medium" :model-value="status ? formatSpeed(status.downloadSpeed) : '0 KB/s'" />
          </NuxtLink>
          <div class="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
          <NuxtLink
            to="/uploads"
            class="flex items-center gap-2 text-green-600 dark:text-green-400"
            @click="() => { isMenuOpen = false }"
          >
            <UIcon name="i-heroicons-arrow-up" class="w-5 h-5" />
            <AnimatedValue class="font-medium" :model-value="status ? formatSpeed(status.uploadSpeed) : '0 KB/s'" />
          </NuxtLink>
        </div>

        <UButton
          icon="i-heroicons-plus"
          color="primary"
          variant="solid"
          class="mt-4 justify-center w-full"
          @click="() => { isAddModalOpen = true; isMenuOpen = false }"
        >
          Add ed2k Link
        </UButton>

        <NavigationMenu 
          :links="navLinks" 
          orientation="vertical" 
          @click="() => { isMenuOpen = false }" 
          class="my-8"
        />

        <div class="flex items-center justify-between">
          <UButton icon="i-simple-icons-github" color="neutral" variant="ghost" to="https://github.com/yourusername/amule-nuxt" target="_blank" aria-label="GitHub" />
          <UButton
            :icon="isDark ? 'i-heroicons-moon-20-solid' : 'i-heroicons-sun-20-solid'"
            color="neutral"
            variant="ghost"
            @click="toggleTheme"
            aria-label="Toggle theme"
          />
        </div>
      </template>
    </USlideover>

    <AddEd2kModal v-model="isAddModalOpen" />
  </UApp>
</template>

<script setup lang="ts">
import { formatSpeed } from '#shared/utils/format'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const isMenuOpen = ref(false)
const isAddModalOpen = ref(false)
const status = ref<any>(null)

const connectionState = useConnection()

// Shapes per transferring file: read from the shared queue state when a page has
// loaded it, so the background does not trigger requests of its own.
const { items: queuedDownloads } = useDownloads()
const activeDownloadFiles = computed(
  () => queuedDownloads.value.filter(download => (download.speed ?? 0) > 0).length
)
const runtimeConfig = useRuntimeConfig()
const isDev = computed(() => process.dev || runtimeConfig.public.isDev)

// Navigation links for desktop and mobile menu
const baseNavLinks = [
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/' },
  { label: 'Downloads', icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { label: 'Uploads', icon: 'i-heroicons-arrow-up-tray', to: '/uploads' },
  { label: 'Search', icon: 'i-heroicons-magnifying-glass', to: '/search' },
  { label: 'Shared', icon: 'i-heroicons-folder-open', to: '/shared' },
  { label: 'Servers', icon: 'i-heroicons-server-stack', to: '/servers' },
  { label: 'Connection', icon: 'i-heroicons-signal', to: '/connection' },
  { label: 'Statistics', icon: 'i-heroicons-chart-bar', to: '/statistics' },
  { label: 'Stats summary', icon: 'i-heroicons-presentation-chart-line', to: '/stats' },
  { label: 'Preferences', icon: 'i-heroicons-adjustments-horizontal', to: '/preferences' },
  { label: 'Logs', icon: 'i-heroicons-document-text', to: '/logs' },
  { label: 'MCP server', icon: 'i-heroicons-cpu-chip', to: '/mcp-server' },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
]

// Add API Test link only in development
const navLinks = computed(() => {
  const links = [...baseNavLinks]
  if (isDev.value) {
    links.push({ label: 'API Test', icon: 'i-heroicons-code-bracket', to: '/api-test' })
  }
  return links
})

/** Links shown directly in the desktop bar; the rest go into the "More" menu. */
const PRIMARY_ROUTES = ['/', '/downloads', '/uploads', '/search', '/shared']

const primaryNavLinks = computed(() => navLinks.value.filter(link => PRIMARY_ROUTES.includes(link.to)))

const secondaryNavItems = computed(() => navLinks.value
  .filter(link => !PRIMARY_ROUTES.includes(link.to))
  .map(link => ({ label: link.label, icon: link.icon, to: link.to })))

// Simplified navigation for mobile (3 pages + menu)
const mobileNavLinks = [
  { label: 'Home', icon: 'i-heroicons-home', to: '/' },
  { label: 'Downloads', icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { label: 'Shared', icon: 'i-heroicons-folder-open', to: '/shared' }
]

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

/** Poll interval while the daemon answers, and the slower one while it does not. */
const STATUS_POLL_MS = 5000
const STATUS_POLL_WHEN_DOWN_MS = 15000

let statusTimer: ReturnType<typeof setTimeout> | null = null
let statusInFlight = false

async function fetchStatus() {
  // Overlapping polls only pile up on the daemon's single EC connection, which
  // is exactly what makes the UI crawl once requests start timing out.
  if (statusInFlight) return
  statusInFlight = true

  try {
    const result = await $fetch('/api/amule/status')
    if (result.success && result.data && result.data.connected) {
      status.value = result.data
      connectionState.value.connected = true
      connectionState.value.error = null
    } else {
      connectionState.value.connected = false
      connectionState.value.error = result.error || (result.data ? 'aMule daemon disconnected' : 'Failed to connect to aMule')
    }
  } catch (e: any) {
    connectionState.value.connected = false
    connectionState.value.error = e.message || 'Connection error'
  } finally {
    statusInFlight = false
  }

  // No redirect: the banner already reports the problem, and yanking the user to
  // the settings page mid-navigation makes every other page unreachable while
  // the daemon is down.
}

/** Self-scheduling poll: it backs off while the daemon is unreachable. */
function scheduleStatus(delay: number) {
  statusTimer = setTimeout(async () => {
    await fetchStatus()
    scheduleStatus(connectionState.value.connected ? STATUS_POLL_MS : STATUS_POLL_WHEN_DOWN_MS)
  }, delay)
}

// The status is chrome (banner and the speed readouts), so it is fetched in the
// browser only. Awaiting it during SSR made every page wait for the EC timeout
// and served a blank shell whenever the daemon was down.
onMounted(() => {
  fetchStatus().then(() => {
    scheduleStatus(connectionState.value.connected ? STATUS_POLL_MS : STATUS_POLL_WHEN_DOWN_MS)
  })
})

onUnmounted(() => {
  if (statusTimer) clearTimeout(statusTimer)
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