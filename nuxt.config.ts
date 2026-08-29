import { readFileSync } from 'node:fs'

// The single source of truth for the version is package.json, which
// semantic-release rewrites on every release. Docker builds pass APP_VERSION so
// an image built from a tag reports that tag instead of the placeholder version
// that sits in package.json between releases.
const { version: packageVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }
const appVersion = process.env.APP_VERSION || packageVersion

/*
 * NUXT_DEMO=1 builds the public demo: a static site (`nuxt generate`) with no
 * server behind it, where an in-browser simulator plays the daemon - see
 * app/plugins/demo.client.ts. Rendering has to happen in the browser, because
 * the simulator lives there, and the site is served from a sub-path on GitHub
 * Pages, which is what NUXT_APP_BASE_URL is for.
 */
const demo = process.env.NUXT_DEMO === '1'
const demoBaseURL = process.env.NUXT_APP_BASE_URL || '/amule-nuxt/'
const publicBase = demo ? demoBaseURL : '/'

/*
 * @mlc-ai/web-llm ships a 6.5 MB bundle whose JSDoc mentions
 * `new URL('./worker.ts', import.meta.url)`. That comment alone makes Vite's
 * asset-import-meta-url plugin scan the whole file with a regex, which blows
 * the stack when the app is built for a sub-path (the demo on GitHub Pages).
 * Renaming the token in the comment before that plugin looks is enough; the
 * library's code has no real `import.meta.url`.
 */
const webLlmCommentFix = {
  name: 'amule:web-llm-comment-fix',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('@mlc-ai/web-llm') || !code.includes('import.meta.url')) return
    return { code: code.replaceAll('import.meta.url', 'import.meta-url'), map: null }
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@nuxtjs/mcp-toolkit', '@nuxtjs/i18n'],

  /*
   * The languages aMule itself ships (its po/ directory), plus English as the
   * source. Same set on purpose: someone running a Greek aMule should not have to
   * read its web interface in English.
   *
   * `no_prefix` because the URLs are part of how this app is used - bookmarks,
   * the ed2k:// protocol handler, the PWA shortcuts and the MCP tools all point
   * at fixed paths, and prefixing them per locale would break every one of them.
   * The choice is remembered in a cookie instead, which is also what lets the
   * server render the right language on the first paint.
   */
  i18n: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3003',
    defaultLocale: 'en',
    strategy: 'no_prefix',
    langDir: 'locales',
    // vueI18n is deliberately unset: the module scans the i18n directory for
    // i18n.config.ts on its own, and a path here is resolved relative to that
    // same directory - pointing at the project root silently skipped the file,
    // taking the fallback chains and the plural rules with it.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'amule_locale',
      // The cookie is only about which language to show, and it has to survive a
      // restart of the browser
      cookieSecure: false,
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: 'en'
    },
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ar', language: 'ar', name: 'العربية', dir: 'rtl', file: 'ar.json' },
      { code: 'ast', language: 'ast', name: 'Asturianu', file: 'ast.json' },
      { code: 'bg', language: 'bg', name: 'Български', file: 'bg.json' },
      { code: 'ca', language: 'ca', name: 'Català', file: 'ca.json' },
      { code: 'cs', language: 'cs', name: 'Čeština', file: 'cs.json' },
      { code: 'da', language: 'da', name: 'Dansk', file: 'da.json' },
      { code: 'de', language: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'el', language: 'el', name: 'Ελληνικά', file: 'el.json' },
      { code: 'en-GB', language: 'en-GB', name: 'English (UK)', file: 'en-GB.json' },
      { code: 'es', language: 'es', name: 'Español', file: 'es.json' },
      { code: 'et', language: 'et-EE', name: 'Eesti', file: 'et.json' },
      { code: 'eu', language: 'eu', name: 'Euskara', file: 'eu.json' },
      { code: 'fi', language: 'fi', name: 'Suomi', file: 'fi.json' },
      { code: 'fr', language: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'gl', language: 'gl', name: 'Galego', file: 'gl.json' },
      { code: 'he', language: 'he', name: 'עברית', dir: 'rtl', file: 'he.json' },
      { code: 'hr', language: 'hr', name: 'Hrvatski', file: 'hr.json' },
      { code: 'hu', language: 'hu', name: 'Magyar', file: 'hu.json' },
      { code: 'it', language: 'it', name: 'Italiano', file: 'it.json' },
      { code: 'it-CH', language: 'it-CH', name: 'Italiano (Svizzera)', file: 'it-CH.json' },
      { code: 'ja', language: 'ja', name: '日本語', file: 'ja.json' },
      { code: 'ko', language: 'ko-KR', name: '한국어', file: 'ko.json' },
      { code: 'lt', language: 'lt', name: 'Lietuvių', file: 'lt.json' },
      { code: 'nl', language: 'nl', name: 'Nederlands', file: 'nl.json' },
      { code: 'nn', language: 'nn-NO', name: 'Norsk nynorsk', file: 'nn.json' },
      { code: 'pl', language: 'pl', name: 'Polski', file: 'pl.json' },
      { code: 'pt-BR', language: 'pt-BR', name: 'Português (Brasil)', file: 'pt-BR.json' },
      { code: 'pt', language: 'pt-PT', name: 'Português (Portugal)', file: 'pt.json' },
      { code: 'ro', language: 'ro', name: 'Română', file: 'ro.json' },
      { code: 'ru', language: 'ru', name: 'Русский', file: 'ru.json' },
      { code: 'sl', language: 'sl', name: 'Slovenščina', file: 'sl.json' },
      { code: 'sq', language: 'sq', name: 'Shqip', file: 'sq.json' },
      { code: 'sv', language: 'sv', name: 'Svenska', file: 'sv.json' },
      { code: 'tr', language: 'tr', name: 'Türkçe', file: 'tr.json' },
      { code: 'uk', language: 'uk', name: 'Українська', file: 'uk.json' },
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'zh-TW', language: 'zh-TW', name: '繁體中文', file: 'zh-TW.json' }
    ]
  },

  // The @iconify-json collections are devDependencies, so they do not exist in
  // the runtime image: the server-side lookup logged "failed to load icon" for
  // every icon and rendered none. Scanning the templates bundles the icons the
  // app actually uses into the client build instead, which also means no icon
  // request ever leaves the browser. Anything the scanner cannot see has to be
  // listed by hand below.
  //
  // To check: load the app and watch for requests to /api/_nuxt_icon. There
  // should be none - one means an icon is missing from the bundle and will not
  // render in the image.
  icon: {
    clientBundle: {
      scan: true,
      icons: [
        // `lucide` is not referenced by any template -- it is what Nuxt UI reaches
        // for internally (chevrons, close buttons) -- so it has to be listed.
        'lucide:chevron-down', 'lucide:chevron-up', 'lucide:chevron-left', 'lucide:chevron-right',
        'lucide:check', 'lucide:x', 'lucide:search', 'lucide:loader-circle', 'lucide:arrow-up-down',

        /*
         * The file-kind icons (shared/utils/fileKind.ts).
         *
         * Scanning finds icon names written in a template; these are chosen at
         * runtime from a file's extension, so the scanner cannot see them and
         * they were being fetched from the server one search result at a time.
         * That works here and fails in the Docker image, where the iconify
         * collections are devDependencies and simply are not installed.
         */
        'heroicons:film', 'heroicons:musical-note', 'heroicons:photo',
        'heroicons:archive-box', 'heroicons:document-text', 'heroicons:cog-6-tooth',
        'heroicons:circle-stack', 'heroicons:document'
      ]
    },
    serverBundle: false
  },

  // Exposes the aMule features of this app as MCP tools on /mcp
  mcp: {
    // Browsers opening /mcp get the human readable page instead of a JSON-RPC error
    browserRedirect: '/mcp-server',
    name: 'aMule Nuxt',
    version: appVersion,
    description: 'Control an aMule daemon: downloads, uploads, shared files, servers, search, Kad and preferences.',
    instructions: [
      'Use amule-status first to check whether the daemon and the networks are connected.',
      'Downloads are identified by their 32 hex character file hash, which amule-downloads returns.',
      'amule-download-remove and amule-server-remove are destructive: confirm with the user before calling them.',
      'Start a search with amule-search, then poll amule-search-results - results keep arriving for a few seconds.',
      'For keywords worth watching over hours or days, create an automatic search with amule-auto-search-start; the server re-runs it every few minutes and amule-auto-searches reads what it has accumulated.',
      'amule-auto-search-control with action delete discards the accumulated results: confirm with the user before calling it.'
    ].join(' ')
  },

  runtimeConfig: {
    // Server-side environment variables
    amuleEcPassword: process.env.AMULE_EC_PASSWORD || '',
    amuleEcHost: process.env.AMULE_EC_HOST || 'localhost',
    amuleEcPort: process.env.AMULE_EC_PORT || '4712',

    public: {
      // Client-side environment variables (never secrets)
      appName: 'aMule Nuxt',
      appVersion,
      /** True in the static demo build, where the daemon is simulated in the browser. */
      demo,
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

  ssr: !demo,

  vite: {
    worker: {
      plugins: () => [webLlmCommentFix]
    },
    plugins: [webLlmCommentFix]
  },

  nitro: demo
    ? {
        // Every page gets its own index.html, so a deep link into the demo works
        // without a server-side rewrite (GitHub Pages has none).
        prerender: { crawlLinks: true, routes: ['/'] }
      }
    : {},

  app: {
    baseURL: demo ? demoBaseURL : '/',
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      title: 'aMule Web Manager',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Modern web-based management interface for aMule daemon' },
        { name: 'theme-color', content: '#00dc82' }
      ],
      // Paths carry the base URL explicitly: the demo lives under a sub-path, and
      // absolute `/favicon.svg` would point at the host's root there.
      link: [
        { rel: 'icon', href: `${publicBase}favicon.svg`, type: 'image/svg+xml' },
        { rel: 'icon', href: `${publicBase}favicon.ico`, sizes: '32x32' },
        { rel: 'apple-touch-icon', href: `${publicBase}apple-touch-icon.png` },
        // Declares the ed2k / magnet protocol handlers when installed as an app
        { rel: 'manifest', href: `${publicBase}manifest.webmanifest` }
      ]
    }
  },
  css: ['~/assets/css/main.css']
})

