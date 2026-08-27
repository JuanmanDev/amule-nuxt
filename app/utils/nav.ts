/**
 * The navigation, and the order it is in.
 *
 * app.vue builds the desktop bar, the "More" menu and the mobile slideover from
 * this list; plugins/nav-direction.client.ts compares where two routes sit in it
 * to decide which way a page transition travels. Both need the same order, so
 * neither of them owns it.
 *
 * Labels are not here on purpose: they come from `nav.<key>` at render time, so
 * switching language relabels the menu without a reload.
 */
export interface NavItem {
  /** Suffix of the i18n key: `nav.<key>` */
  key: string
  icon: string
  to: string
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: 'i-heroicons-home', to: '/' },
  { key: 'downloads', icon: 'i-heroicons-arrow-down-tray', to: '/downloads' },
  { key: 'uploads', icon: 'i-heroicons-arrow-up-tray', to: '/uploads' },
  { key: 'search', icon: 'i-heroicons-magnifying-glass', to: '/search' },
  { key: 'searchAuto', icon: 'i-heroicons-arrow-path-rounded-square', to: '/search-auto' },
  { key: 'shared', icon: 'i-heroicons-folder-open', to: '/shared' },
  { key: 'assistant', icon: 'i-heroicons-sparkles', to: '/assistant' },
  { key: 'servers', icon: 'i-heroicons-server-stack', to: '/servers' },
  { key: 'connection', icon: 'i-heroicons-signal', to: '/connection' },
  { key: 'statistics', icon: 'i-heroicons-chart-bar', to: '/statistics' },
  { key: 'statsSummary', icon: 'i-heroicons-presentation-chart-line', to: '/stats' },
  { key: 'preferences', icon: 'i-heroicons-adjustments-horizontal', to: '/preferences' },
  { key: 'logs', icon: 'i-heroicons-document-text', to: '/logs' },
  { key: 'mcpServer', icon: 'i-heroicons-cpu-chip', to: '/mcp-server' },
  { key: 'settings', icon: 'i-heroicons-cog-6-tooth', to: '/settings' }
]

/** Shown in the bar only while developing, but it still has a place in the order. */
export const DEV_NAV_ITEM: NavItem = { key: 'apiTest', icon: 'i-heroicons-code-bracket', to: '/api-test' }

/** Links shown directly in the desktop bar; everything else goes to "More". */
export const PRIMARY_ROUTES = ['/', '/downloads', '/uploads', '/search', '/shared']

/**
 * Route paths in menu order, which is what makes "forward" and "back" mean
 * something to a page transition. Routes that are not in the menu (/add,
 * /handle-link) are absent by design - see the plugin for what it does with them.
 */
export const NAV_ORDER: string[] = [...NAV_ITEMS, DEV_NAV_ITEM].map(item => item.to)
