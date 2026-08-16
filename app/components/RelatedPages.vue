<template>
  <UCard>
    <template #header>
      <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {{ $t('related.title') }}
      </h2>
    </template>

    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="page in resolved"
        :key="page.to"
        :to="page.to"
        class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:bg-elevated/60 transition-colors"
      >
        <UIcon :name="page.icon" class="w-5 h-5 mt-0.5 shrink-0 text-primary-500" />
        <span class="min-w-0">
          <span class="block font-medium">{{ page.label }}</span>
          <span class="block text-sm text-gray-500 dark:text-gray-400">{{ page.description }}</span>
        </span>
      </NuxtLink>
    </div>
  </UCard>
</template>

<script setup lang="ts">
/**
 * "You might be looking for" links at the foot of a page.
 *
 * The pages overlap on purpose — the two statistics views, servers and
 * connection, search and its automatic sibling — and the fastest way to learn
 * that is a link at the point where one page stops answering the question.
 *
 * Pages are named by key rather than by route, so the icon and the two labels
 * live in exactly one place each: the icon here, the name under `nav.*` and the
 * one-line description under `related.descriptions.*`.
 */

type PageKey =
  | 'dashboard' | 'downloads' | 'uploads' | 'shared'
  | 'search' | 'searchAuto' | 'assistant'
  | 'servers' | 'connection' | 'statistics' | 'statsSummary'
  | 'preferences' | 'logs' | 'settings' | 'mcpServer';

const REGISTRY: Record<PageKey, { to: string; icon: string }> = {
  dashboard: { to: '/', icon: 'i-heroicons-home' },
  downloads: { to: '/downloads', icon: 'i-heroicons-arrow-down-tray' },
  uploads: { to: '/uploads', icon: 'i-heroicons-arrow-up-tray' },
  shared: { to: '/shared', icon: 'i-heroicons-folder-open' },
  search: { to: '/search', icon: 'i-heroicons-magnifying-glass' },
  searchAuto: { to: '/search-auto', icon: 'i-heroicons-arrow-path-rounded-square' },
  assistant: { to: '/assistant', icon: 'i-heroicons-sparkles' },
  servers: { to: '/servers', icon: 'i-heroicons-server-stack' },
  connection: { to: '/connection', icon: 'i-heroicons-signal' },
  statistics: { to: '/statistics', icon: 'i-heroicons-chart-bar' },
  statsSummary: { to: '/stats', icon: 'i-heroicons-presentation-chart-line' },
  preferences: { to: '/preferences', icon: 'i-heroicons-adjustments-horizontal' },
  logs: { to: '/logs', icon: 'i-heroicons-document-text' },
  settings: { to: '/settings', icon: 'i-heroicons-cog-6-tooth' },
  mcpServer: { to: '/mcp-server', icon: 'i-heroicons-cpu-chip' }
};

const props = defineProps<{ pages: PageKey[] }>();

const { t } = useI18n();

const resolved = computed(() => props.pages
  .filter(key => key in REGISTRY)
  .map(key => ({
    ...REGISTRY[key],
    label: t(`nav.${key}`),
    description: t(`related.descriptions.${key}`)
  })));
</script>
