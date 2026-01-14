<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { createHighlighter, type Highlighter } from 'shiki'
import { Download, ExternalLink, AlertCircle } from 'lucide-vue-next'

interface Props {
  url: string | null
  filename: string
  fileSize: number
  maxSize?: number // Max size to auto-fetch (default 1MB)
  maxHeight?: string // CSS max-height for the code container
}

const props = withDefaults(defineProps<Props>(), {
  maxSize: 1024 * 1024, // 1MB
  maxHeight: '256px',
})

const emit = defineEmits<{
  download: []
  'open-new-tab': []
}>()

const { t } = useI18n()

// State
const content = ref<string | null>(null)
const highlightedHtml = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const truncated = ref(false)

// Highlighter instance (lazy loaded)
let highlighter: Highlighter | null = null

// File extension
const fileExtension = computed(() => {
  return props.filename.split('.').pop()?.toLowerCase() || ''
})

// Map file extensions to Shiki language identifiers
const languageMap: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Data formats
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  csv: 'plaintext',
  ini: 'ini',

  // Programming languages
  py: 'python',
  python: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  r: 'r',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  ex: 'elixir',
  exs: 'elixir',
  clj: 'clojure',
  cljs: 'clojure',
  hs: 'haskell',
  elm: 'elm',
  erl: 'erlang',
  fs: 'fsharp',
  fsx: 'fsharp',
  ml: 'ocaml',
  nim: 'nim',
  zig: 'zig',
  v: 'v',
  d: 'd',
  dart: 'dart',
  groovy: 'groovy',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'batch',
  cmd: 'batch',

  // Config files
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
  gradle: 'groovy',

  // Markup
  md: 'markdown',
  markdown: 'markdown',
  rst: 'rst',
  tex: 'latex',
  latex: 'latex',

  // SQL
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'sql',

  // Other
  diff: 'diff',
  patch: 'diff',
  graphql: 'graphql',
  gql: 'graphql',
  prisma: 'prisma',
  proto: 'proto',

  // Plain text (no highlighting)
  txt: 'plaintext',
  text: 'plaintext',
  log: 'log',
  env: 'dotenv',
  conf: 'ini',
  cfg: 'ini',
  properties: 'properties',
}

// Get Shiki language for file
const shikiLanguage = computed((): string => {
  const ext = fileExtension.value
  return languageMap[ext] || 'plaintext'
})

// Check if file is too large
const isTooLarge = computed(() => props.fileSize > props.maxSize)

// Should auto-fetch content
const shouldAutoFetch = computed(() => !isTooLarge.value && props.url)

// Line count for display
const lineCount = computed(() => {
  if (!content.value) return 0
  return content.value.split('\n').length
})

// Initialize highlighter
async function initHighlighter() {
  if (highlighter) return highlighter

  try {
    highlighter = await createHighlighter({
      themes: ['github-dark-default'],
      langs: [shikiLanguage.value as 'javascript'], // Cast to satisfy type, actual lang is loaded dynamically
    })
    return highlighter
  } catch (e) {
    console.error('Failed to initialize Shiki highlighter:', e)
    return null
  }
}

// Load additional language if needed
async function loadLanguage(lang: string) {
  if (!highlighter) return

  const loadedLangs = highlighter.getLoadedLanguages()
  if (!loadedLangs.includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as Parameters<typeof highlighter.loadLanguage>[0])
    } catch (e) {
      console.warn(`Failed to load language ${lang}, falling back to plaintext`)
    }
  }
}

// Fetch and highlight content
async function fetchContent() {
  if (!props.url || loading.value) return

  loading.value = true
  error.value = null
  truncated.value = false

  try {
    const response = await fetch(props.url)

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    }

    let text = await response.text()

    // Truncate if too large (shouldn't happen if size check works, but safety net)
    const truncateLimit = props.maxSize
    if (text.length > truncateLimit) {
      text = text.slice(0, truncateLimit)
      truncated.value = true
    }

    content.value = text

    // Highlight the code
    await highlightCode(text)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load content'
    content.value = null
    highlightedHtml.value = null
  } finally {
    loading.value = false
  }
}

// Highlight code with Shiki
async function highlightCode(code: string) {
  try {
    const hl = await initHighlighter()
    if (!hl) {
      // Fallback to plain text display
      highlightedHtml.value = escapeHtml(code)
      return
    }

    const lang = shikiLanguage.value
    await loadLanguage(lang)

    // Check if language is loaded, fall back to plaintext if not
    const loadedLangs = hl.getLoadedLanguages()
    const finalLang = loadedLangs.includes(lang) ? lang : 'plaintext'

    highlightedHtml.value = hl.codeToHtml(code, {
      lang: finalLang as 'plaintext', // Cast to satisfy type
      theme: 'github-dark-default',
    })
  } catch (e) {
    console.error('Highlighting failed:', e)
    // Fallback to plain text
    highlightedHtml.value = `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

// Escape HTML for fallback display
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Watch for URL changes and refetch
watch(() => props.url, () => {
  content.value = null
  highlightedHtml.value = null
  error.value = null
  if (shouldAutoFetch.value) {
    fetchContent()
  }
}, { immediate: false })

// Initial fetch
onMounted(() => {
  if (shouldAutoFetch.value) {
    fetchContent()
  }
})
</script>

<template>
  <!-- Too large - show download prompt -->
  <div v-if="isTooLarge" class="flex flex-col items-center justify-center py-8 px-4 rounded-lg bg-bg-tertiary border border-border-subtle">
    <AlertCircle class="w-10 h-10 text-text-tertiary mb-3" />
    <p class="text-sm text-text-primary text-center font-medium mb-1">{{ t('objects.code_preview.file_too_large') }}</p>
    <p class="text-xs text-text-tertiary text-center mb-4">
      {{ t('objects.code_preview.exceeds_limit', { size: (fileSize / 1024 / 1024).toFixed(2), limit: (maxSize / 1024 / 1024).toFixed(0) }) }}
    </p>
    <div class="flex items-center gap-2">
      <UiButton
        v-if="url"
        variant="secondary"
        size="sm"
        @click="emit('open-new-tab')"
      >
        <ExternalLink class="w-4 h-4" />
        {{ t('objects.preview.open') }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        @click="emit('download')"
      >
        <Download class="w-4 h-4" />
        {{ t('objects.preview.download') }}
      </UiButton>
    </div>
  </div>

  <!-- Loading state -->
  <div v-else-if="loading" class="rounded-lg bg-bg-tertiary border border-border-subtle p-4">
    <div class="flex items-center justify-center py-8">
      <div class="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      <span class="ml-3 text-sm text-text-secondary">{{ t('objects.code_preview.loading_content') }}</span>
    </div>
  </div>

  <!-- Error state -->
  <div v-else-if="error" class="flex flex-col items-center justify-center py-8 px-4 rounded-lg bg-error/10 border border-error/20">
    <AlertCircle class="w-10 h-10 text-error mb-3" />
    <p class="text-sm text-error text-center mb-4">{{ error }}</p>
    <div class="flex items-center gap-2">
      <UiButton
        variant="secondary"
        size="sm"
        @click="fetchContent"
      >
        {{ t('common.actions.try_again') }}
      </UiButton>
      <UiButton
        variant="primary"
        size="sm"
        @click="emit('download')"
      >
        <Download class="w-4 h-4" />
        {{ t('objects.preview.download') }}
      </UiButton>
    </div>
  </div>

  <!-- Code display -->
  <div v-else-if="highlightedHtml" class="rounded-lg overflow-hidden border border-border-subtle bg-[#0d1117]">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-bg-tertiary/80 border-b border-border-subtle">
      <div class="flex items-center gap-2">
        <span class="text-xs text-text-tertiary font-mono">{{ shikiLanguage }}</span>
        <span class="text-xs text-text-tertiary">·</span>
        <span class="text-xs text-text-tertiary">{{ lineCount }} lines</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="url"
          type="button"
          class="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          :title="t('objects.preview.open_new_tab')"
          @click="emit('open-new-tab')"
        >
          <ExternalLink class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          :title="t('common.actions.download')"
          @click="emit('download')"
        >
          <Download class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Code content -->
    <div
      class="overflow-auto text-sm font-mono code-preview"
      :style="{ maxHeight }"
      v-html="highlightedHtml"
    />

    <!-- Truncation warning -->
    <div
      v-if="truncated"
      class="px-3 py-2 bg-warning/10 border-t border-warning/20 text-xs text-warning text-center"
    >
      {{ t('objects.code_preview.file_truncated') }}
    </div>
  </div>

  <!-- Waiting for URL -->
  <div v-else class="flex flex-col items-center justify-center py-8 px-4 rounded-lg bg-bg-tertiary border border-border-subtle">
    <div class="w-6 h-6 border-2 border-text-tertiary border-t-transparent rounded-full animate-spin mb-3" />
    <p class="text-sm text-text-secondary">{{ t('objects.code_preview.preparing_preview') }}</p>
  </div>
</template>

<style>
/* Shiki code block styling */
.code-preview pre {
  margin: 0;
  padding: 1rem;
  background: transparent !important;
  overflow-x: auto;
}

.code-preview code {
  font-family: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
}

/* Line numbers via Shiki - if enabled */
.code-preview .line {
  display: inline-block;
  width: 100%;
}

/* Scrollbar styling */
.code-preview::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.code-preview::-webkit-scrollbar-track {
  background: transparent;
}

.code-preview::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.code-preview::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.code-preview::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
