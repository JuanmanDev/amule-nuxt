// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/mcp-toolkit'],

  // Exposes the aMule features of this app as MCP tools on /mcp
  mcp: {
    // Browsers opening /mcp get the human readable page instead of a JSON-RPC error
    browserRedirect: '/mcp-server',
    name: 'aMule Nuxt',
    version: '1.0.0',
    description: 'Control an aMule daemon: downloads, uploads, shared files, servers, search, Kad and preferences.',
    instructions: [
      'Use amule-status first to check whether the daemon and the networks are connected.',
      'Downloads are identified by their 32 hex character file hash, which amule-downloads returns.',
      'amule-download-remove and amule-server-remove are destructive: confirm with the user before calling them.',
      'Start a search with amule-search, then poll amule-search-results - results keep arriving for a few seconds.'
    ].join(' ')
  },

  runtimeConfig: {
    // Server-side environment variables
    amuleEcPassword: process.env.AMULE_EC_PASSWORD || '',
    amuleEcHost: process.env.AMULE_EC_HOST || 'localhost',
    amuleEcPort: process.env.AMULE_EC_PORT || '4712',
    amuleCmdPath: process.env.AMULE_CMD_PATH || 'amulecmd',

    public: {
      // Client-side environment variables (never secrets)
      appName: 'aMule Nuxt',
      amuleEcHost: process.env.AMULE_EC_HOST || 'localhost',
      amuleEcPort: process.env.AMULE_EC_PORT || '4712',
      // Port of the live-update WebSocket server (see server/plugins/websocket.ts)
      wsPort: process.env.WS_PORT || '3001',
    }
  },

  typescript: {
    strict: true,
    typeCheck: false // Set to true after installing vue-tsc: npm i -D vue-tsc
  },

  ssr: true,

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'aMule Web Manager',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Modern web-based management interface for aMule daemon' }
      ],
      link: [
        // Declares the ed2k / magnet protocol handlers when installed as an app
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ]
    }
  },
  css: ['~/assets/css/main.css']
})

