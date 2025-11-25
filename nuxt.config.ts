// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxt/ui'],

  runtimeConfig: {
    // Server-side environment variables
    amuleEcPassword: process.env.AMULE_EC_PASSWORD || '',
    amuleEcHost: process.env.AMULE_EC_HOST || 'localhost',
    amuleEcPort: process.env.AMULE_EC_PORT || '4712',
    amuleCmdPath: process.env.AMULE_CMD_PATH || 'amulecmd',

    public: {
      // Client-side environment variables
      appName: 'aMule Nuxt',
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
      ]
    }
  },
  css: ['~/assets/css/main.css']
})

