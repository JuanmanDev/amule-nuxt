<template>
  <UApp>
    <UContainer class="min-h-screen">
      <!-- Header Navigation -->
      <header class="border-b border-gray-200 dark:border-gray-800">
        <div class="py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-down-tray" class="w-8 h-8" />
              <h1 class="text-2xl font-bold">aMule Web Manager</h1>
            </div>
            
            <StatusIndicator />
          </div>
          
          <!-- Navigation Tabs -->
          <nav class="mt-4">
            <UTabs
              :items="[
                { label: 'Dashboard', to: '/' },
                { label: 'Downloads', to: '/downloads' },
                { label: 'Search', to: '/search' },
                { label: 'Uploads', to: '/uploads' },
                { label: 'Servers', to: '/servers' },
                { label: 'Statistics', to: '/statistics' },
                { label: 'Settings', to: '/settings' }
              ]"
            />
          </nav>
        </div>
      </header>

      <!-- Main Content -->
      <main class="py-8">
        <NuxtPage />
      </main>
    </UContainer>

    <!-- Toast Notifications -->
    <UNotifications />
  </UApp>
</template>

<script setup lang="ts">
// SEO
useHead({
  titleTemplate: '%s - aMule Web Manager'
});
</script>
