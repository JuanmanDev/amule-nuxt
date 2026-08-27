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
      :title="$t('app.daemonUnreachable', { reason: connectionState.error || $t('app.daemonUnreachableFallback') })"
      :actions="[{ label: $t('app.openSettings'), to: '/settings', color: 'neutral', variant: 'outline', size: 'xs' }]"
    />
    <!-- Desktop Navigation - Top Bar -->
    <header class="hidden lg:block sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <UContainer>
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-xl">
            <UIcon name="i-heroicons-server" class="w-6 h-6" />
            {{ $t('app.name') }}
          </NuxtLink>

          <!-- Navigation Links: primary inline, the rest in a menu -->
          <div class="flex items-center gap-2 min-w-0">
            <NavigationMenu :links="primaryNavLinks" orientation="horizontal" />
            <UDropdownMenu :items="[secondaryNavItems]" :modal="false">
              <UButton variant="ghost" color="neutral" trailing-icon="i-heroicons-chevron-down">
                {{ $t('app.more') }}
              </UButton>
            </UDropdownMenu>
            <UButton icon="i-heroicons-plus" color="primary" variant="solid" @click="() => { isAddModalOpen = true }">
              {{ $t('app.addLink') }}
            </UButton>
          </div>
        </div>
      </UContainer>
    </header>

    <!-- Main Content. The column stretches to the viewport so a short page can
         push its related-pages section to the bottom (mt-auto in RelatedPages);
         a tall page simply flows past the minimum.

         `overflow-x-clip` is for the page transition: the pages slide sideways,
         and on a narrow screen that travel is wider than the container's padding,
         so without it the animation would flash a horizontal scrollbar. `clip`
         rather than `hidden` because it does not create a scroll container, which
         is what keeps the sticky header and the fixed selection bar where they
         are. -->
    <UMain class="pb-32 lg:pb-0">
      <UContainer class="py-8 flex flex-col min-h-[calc(100vh-8rem)] overflow-x-clip">
        <NuxtPage class="flex-1 flex flex-col" />
      </UContainer>
    </UMain>

    <!-- Footer -->
    <footer class="hidden lg:block border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <UContainer>
        <div class="flex items-center justify-between h-16">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ $t('app.footer', { year: new Date().getFullYear() }) }} Juanma was here.
            <!-- The running version, linked to what changed in it -->
            <a
              href="https://github.com/JuanmanDev/amule-nuxt/releases"
              target="_blank"
              class="hover:underline"
            >aMule Nuxt v{{ runtimeConfig.public.appVersion }}</a>
          </p>
          <div class="flex items-center gap-2">
            <LanguageSwitcher />
            <ColorSchemeToggle />
            <UButton
              icon="i-simple-icons-github"
              color="neutral"
              variant="ghost"
              to="https://github.com/JuanmanDev/amule-nuxt"
              target="_blank"
              :aria-label="$t('app.github')"
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
          <span class="text-xs">{{ $t('app.menu') }}</span>
        </button>
      </div>
    </nav>

    <!-- Mobile Menu Slideover -->
    <USlideover :title="$t('app.name')" v-model:open="isMenuOpen" side="right">
      <template #body>
        <!-- Bottom weighted: `mt-auto` on the links pushes them and the add button
             down to the thumb when the menu is taller than its content, and
             collapses to nothing when it is not, so a long list still scrolls from
             the top. A class on <template> would be dropped. -->
        <div class="flex flex-col min-h-full gap-4">
          <!-- Settings for the app itself, at the top and out of the way of the
               thumb: they are the things you touch once, unlike the links and the
               add button below. Same components as the desktop footer, so the
               icons are picked by CSS rather than by a value the server cannot
               know. -->
          <div class="flex items-center justify-between">
            <UButton icon="i-simple-icons-github" color="neutral" variant="ghost" to="https://github.com/JuanmanDev/amule-nuxt" target="_blank" :aria-label="$t('app.github')" />
            <LanguageSwitcher />
            <ColorSchemeToggle />
          </div>

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

          <NavigationMenu
            :links="navLinks"
            orientation="vertical"
            class="mt-auto"
            @click="() => { isMenuOpen = false }"
          />

          <!-- Last, so it is the control closest to the thumb -->
          <UButton
            icon="i-heroicons-plus"
            color="primary"
            variant="solid"
            class="justify-center w-full"
            @click="() => { isAddModalOpen = true; isMenuOpen = false }"
          >
            {{ $t('app.addEd2kLink') }}
          </UButton>
        </div>
      </template>
    </USlideover>

    <AddEd2kModal v-model="isAddModalOpen" />

    <!-- Names the icon-only controls for touch, where `title` never opens -->
    <TouchHint />
  </UApp>
</template>

<script setup lang="ts">
import { formatSpeed } from '#shared/utils/format'
import { NAV_ITEMS, DEV_NAV_ITEM, PRIMARY_ROUTES } from '~/utils/nav'

const { t } = useI18n()

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

// Navigation links for desktop and mobile menu. The list and its order live in
// utils/nav.ts, because the page transition reads the same order to work out
// which way it travels. Labels are resolved through a computed rather than built
// once, so switching language relabels the menu without a reload.
const navLinks = computed(() => {
  // The API test page is a development tool, not part of the app
  const links = isDev.value ? [...NAV_ITEMS, DEV_NAV_ITEM] : NAV_ITEMS
  return links.map(link => ({ ...link, label: t(`nav.${link.key}`) }))
})

const primaryNavLinks = computed(() => navLinks.value.filter(link => PRIMARY_ROUTES.includes(link.to)))

const secondaryNavItems = computed(() => navLinks.value
  .filter(link => !PRIMARY_ROUTES.includes(link.to))
  .map(link => ({ label: link.label, icon: link.icon, to: link.to })))

// Simplified navigation for mobile (3 pages + menu)
const mobileNavLinks = computed(() => [
  { label: t('nav.home'), icon: 'i-heroicons-home', to: '/' },
  { label: t('nav.downloads'), icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { label: t('nav.shared'), icon: 'i-heroicons-folder-open', to: '/shared' }
])

/** Poll interval while the daemon answers, and the slower one while it does not. */
const STATUS_POLL_MS = 5000
const STATUS_POLL_WHEN_DOWN_MS = 15000
/**
 * How long one status read may take before it is abandoned. A browser that
 * freezes a background tab drops the connection without failing the request, so
 * an unbounded read plus the guard below is a banner that stays wrong until the
 * page is reloaded.
 */
const STATUS_TIMEOUT_MS = 10000

let statusTimer: ReturnType<typeof setTimeout> | null = null
let statusStartedAt = 0
let statusInFlight = false

async function fetchStatus() {
  // Overlapping polls only pile up on the daemon's single EC connection, which
  // is exactly what makes the UI crawl once requests start timing out. The
  // guard is dropped once a read is past any time it could still answer in.
  if (statusInFlight && Date.now() - statusStartedAt < STATUS_TIMEOUT_MS * 2) return
  statusInFlight = true
  statusStartedAt = Date.now()

  try {
    const result = await $fetch('/api/amule/status', { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) })
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

/**
 * Coming back to a tab the browser had put to sleep restarts the poll from now.
 *
 * Its timers did not run while it was frozen, so the pending one can be minutes
 * late, and the banner would go on claiming the daemon is unreachable long after
 * it is back. Asking straight away is also the only way to clear an error that
 * only ever described the moment the tab went away.
 */
function wake() {
  if (document.visibilityState !== 'visible') return
  if (statusTimer) clearTimeout(statusTimer)
  fetchStatus().then(() => {
    scheduleStatus(connectionState.value.connected ? STATUS_POLL_MS : STATUS_POLL_WHEN_DOWN_MS)
  })
}

// The status is chrome (banner and the speed readouts), so it is fetched in the
// browser only. Awaiting it during SSR made every page wait for the EC timeout
// and served a blank shell whenever the daemon was down.
onMounted(() => {
  fetchStatus().then(() => {
    scheduleStatus(connectionState.value.connected ? STATUS_POLL_MS : STATUS_POLL_WHEN_DOWN_MS)
  })

  document.addEventListener('visibilitychange', wake)
  window.addEventListener('online', wake)
  window.addEventListener('pageshow', wake)
})

onUnmounted(() => {
  if (statusTimer) clearTimeout(statusTimer)
  document.removeEventListener('visibilitychange', wake)
  window.removeEventListener('online', wake)
  window.removeEventListener('pageshow', wake)
})

// Frosted panels are a `backdrop-filter` on every card, row and tile: the browser
// re-blurs the region behind each one whenever anything there moves or scrolls.
// A class on <html> lets the whole app drop them in one go, and it is set during
// SSR so the first paint is already correct.
const { glass } = useAppearance()

// Writing direction and language for <html>. The locales declare `dir`, but the
// i18n module only turns that into an attribute through this composable - left
// uncalled, Arabic and Hebrew rendered left to right with the whole layout
// mirrored the wrong way. `seo: false` because the app is a private client for a
// daemon: alternate and canonical links for 38 languages are of no use to it.
const localeHead = useLocaleHead({ dir: true, lang: true, seo: false })

// SEO
useHead({
  titleTemplate: '%s - aMule Nuxt',
  htmlAttrs: {
    class: computed(() => (glass.value ? '' : 'no-glass')),
    lang: computed(() => localeHead.value.htmlAttrs?.lang),
    dir: computed(() => localeHead.value.htmlAttrs?.dir)
  }
})
</script>