export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
  ],

  i18n: {
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'ru', name: 'Русский', file: 'ru.json' },
    ],
    defaultLocale: 'en',
    bundle: {
      fullInstall: false,
    },
    langDir: 'locales',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'nebula_locale',
      fallbackLocale: 'en',
    },
  },

  css: [
    '~/assets/css/main.css',
  ],

  vite: {
    plugins: [
      (await import('@tailwindcss/vite')).default(),
    ],
  },

  app: {
    head: {
      title: 'Nebula',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'A modern S3 browser for Ceph RGW' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap' },
      ],
    },
  },

  typescript: {
    strict: true,
    // typeCheck in dev uses vite-plugin-checker which has issues with vue-tsc 3.x
    // Build still runs type checking via nuxi which works correctly
    typeCheck: 'build',
  },

  pinia: {
    storesDirs: ['./app/stores/**'],
  },
})
