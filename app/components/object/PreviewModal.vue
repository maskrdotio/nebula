<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  Download,
  Trash2,
  Link,
  Copy,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  File,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-vue-next'
import type { ObjectItem } from './Row.vue'

interface Props {
  item: ObjectItem | null
  bucket: string
  open: boolean
  objectUrl?: string
  loading?: boolean
  // Gallery mode props
  items?: ObjectItem[]
  currentIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  items: () => [],
  currentIndex: 0,
})

const emit = defineEmits<{
  close: []
  download: []
  delete: []
  'copy-url': []
  'copy-s3-uri': []
  'open-new-tab': []
  'navigate': [index: number]
}>()

const { t } = useI18n()

// State
const imageLoaded = ref(false)
const previewError = ref<string | null>(null)
const isZoomed = ref(false)
const zoomLevel = ref(1)
const rotation = ref(0)

// File extension
const fileExtension = computed(() => {
  if (!props.item || props.item.isFolder) return ''
  return props.item.name.split('.').pop()?.toLowerCase() || ''
})

// Determine preview type
const previewType = computed<'image' | 'video' | 'audio' | 'text' | 'code' | 'pdf' | 'none'>(() => {
  if (!props.item || props.item.isFolder) return 'none'

  const ext = fileExtension.value

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext)) {
    return 'image'
  }

  // Videos
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return 'video'
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) {
    return 'audio'
  }

  // PDF
  if (ext === 'pdf') {
    return 'pdf'
  }

  // Code/text
  if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'toml', 'json', 'sh', 'bash', 'md', 'txt', 'log', 'csv', 'sql', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'lua', 'pl', 'ex', 'exs', 'clj', 'hs', 'elm', 'erl', 'fs', 'ml', 'nim', 'zig', 'v', 'd', 'dart', 'groovy', 'ps1', 'bat', 'cmd', 'dockerfile', 'makefile', 'cmake', 'gradle', 'sbt', 'cargo', 'gemfile', 'rakefile', 'podfile', 'vagrantfile', 'jenkinsfile', 'ini', 'conf', 'cfg', 'properties', 'env', 'gitignore', 'gitattributes', 'editorconfig', 'eslintrc', 'prettierrc', 'babelrc', 'tsconfig', 'jsconfig'].includes(ext)) {
    return 'code'
  }

  return 'none'
})

// Icon for file type
const fileIcon = computed(() => {
  const type = previewType.value
  switch (type) {
    case 'image': return FileImage
    case 'video': return FileVideo
    case 'audio': return FileAudio
    case 'pdf':
    case 'text': return FileText
    case 'code': return FileCode
    default: return File
  }
})

// Gallery navigation
const hasGallery = computed(() => props.items && props.items.length > 1)
const hasPrevious = computed(() => hasGallery.value && props.currentIndex > 0)
const hasNext = computed(() => hasGallery.value && props.currentIndex < props.items.length - 1)
const galleryPosition = computed(() => {
  if (!hasGallery.value) return ''
  return `${props.currentIndex + 1} of ${props.items.length}`
})

// Format size
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

// Format date
function formatDate(date: Date | undefined): string {
  if (!date) return ''
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Navigation functions
function navigatePrevious() {
  if (hasPrevious.value) {
    emit('navigate', props.currentIndex - 1)
  }
}

function navigateNext() {
  if (hasNext.value) {
    emit('navigate', props.currentIndex + 1)
  }
}

// Image controls
function toggleZoom() {
  if (isZoomed.value) {
    zoomLevel.value = 1
    isZoomed.value = false
  } else {
    zoomLevel.value = 2
    isZoomed.value = true
  }
}

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 0.5, 5)
  isZoomed.value = zoomLevel.value > 1
}

function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 0.5, 0.5)
  isZoomed.value = zoomLevel.value > 1
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360
}

function resetTransform() {
  zoomLevel.value = 1
  rotation.value = 0
  isZoomed.value = false
}

// Close modal
function close() {
  emit('close')
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return

  switch (event.key) {
    case 'Escape':
      close()
      break
    case 'ArrowLeft':
      if (hasGallery.value) {
        event.preventDefault()
        navigatePrevious()
      }
      break
    case 'ArrowRight':
      if (hasGallery.value) {
        event.preventDefault()
        navigateNext()
      }
      break
    case '+':
    case '=':
      if (previewType.value === 'image') {
        event.preventDefault()
        zoomIn()
      }
      break
    case '-':
      if (previewType.value === 'image') {
        event.preventDefault()
        zoomOut()
      }
      break
    case '0':
      if (previewType.value === 'image') {
        event.preventDefault()
        resetTransform()
      }
      break
  }
}

// Reset state when item changes
watch(() => props.item, () => {
  previewError.value = null
  imageLoaded.value = false
  resetTransform()
})

// Lock body scroll when open
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && item"
        class="fixed inset-0 z-[100] flex items-center justify-center"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/90 backdrop-blur-sm" />

        <!-- Header -->
        <div class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <!-- Left: File info -->
          <div class="flex items-center gap-3 min-w-0">
            <component :is="fileIcon" class="w-5 h-5 text-text-secondary flex-shrink-0" />
            <div class="min-w-0">
              <h3 class="text-sm font-medium text-text-primary truncate max-w-md">{{ item.name }}</h3>
              <div class="flex items-center gap-3 text-xs text-text-tertiary">
                <span class="font-mono">{{ formatSize(item.size) }}</span>
                <span v-if="item.lastModified">{{ formatDate(item.lastModified) }}</span>
                <span v-if="hasGallery" class="text-text-secondary">{{ galleryPosition }}</span>
              </div>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-1">
            <!-- Image controls -->
            <template v-if="previewType === 'image'">
              <button
                type="button"
                class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                :title="t('objects.preview.zoom_out')"
                @click="zoomOut"
              >
                <ZoomOut class="w-5 h-5" />
              </button>
              <span class="text-xs text-text-tertiary font-mono min-w-12 text-center">
                {{ Math.round(zoomLevel * 100) }}%
              </span>
              <button
                type="button"
                class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                :title="t('objects.preview.zoom_in')"
                @click="zoomIn"
              >
                <ZoomIn class="w-5 h-5" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                :title="t('objects.preview.rotate')"
                @click="rotate"
              >
                <RotateCw class="w-5 h-5" />
              </button>
              <div class="w-px h-6 bg-white/20 mx-1" />
            </template>

            <button
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              :title="t('objects.preview.copy_url')"
              @click="emit('copy-url')"
            >
              <Link class="w-5 h-5" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              :title="t('objects.preview.copy_uri')"
              @click="emit('copy-s3-uri')"
            >
              <Copy class="w-5 h-5" />
            </button>
            <button
              v-if="objectUrl"
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              :title="t('objects.preview.open_new_tab')"
              @click="emit('open-new-tab')"
            >
              <ExternalLink class="w-5 h-5" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              :title="t('common.actions.download')"
              @click="emit('download')"
            >
              <Download class="w-5 h-5" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-error hover:bg-white/10 transition-colors"
              :title="t('common.actions.delete')"
              @click="emit('delete')"
            >
              <Trash2 class="w-5 h-5" />
            </button>
            <div class="w-px h-6 bg-white/20 mx-1" />
            <button
              type="button"
              class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
              :title="t('objects.preview.close_esc')"
              @click="close"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Gallery Navigation - Previous -->
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-100"
          leave-to-class="opacity-0"
        >
          <button
            v-if="hasPrevious"
            type="button"
            class="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-text-primary hover:bg-black/70 hover:scale-110 transition-all backdrop-blur-sm border border-white/10"
            :title="t('objects.preview.previous')"
            @click="navigatePrevious"
          >
            <ChevronLeft class="w-6 h-6" />
          </button>
        </Transition>

        <!-- Gallery Navigation - Next -->
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-100"
          leave-to-class="opacity-0"
        >
          <button
            v-if="hasNext"
            type="button"
            class="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-text-primary hover:bg-black/70 hover:scale-110 transition-all backdrop-blur-sm border border-white/10"
            :title="t('objects.preview.next')"
            @click="navigateNext"
          >
            <ChevronRight class="w-6 h-6" />
          </button>
        </Transition>

        <!-- Main Content Area -->
        <div class="relative w-full h-full flex items-center justify-center p-16 overflow-hidden">
          <!-- Image Preview -->
          <div
            v-if="previewType === 'image' && objectUrl"
            class="relative max-w-full max-h-full overflow-auto"
            :class="{ 'cursor-zoom-in': !isZoomed, 'cursor-zoom-out': isZoomed }"
            @click="toggleZoom"
          >
            <img
              :src="objectUrl"
              :alt="item.name"
              class="max-w-none transition-transform duration-200"
              :style="{
                transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                maxWidth: isZoomed ? 'none' : '100%',
                maxHeight: isZoomed ? 'none' : 'calc(100vh - 10rem)',
              }"
              @load="imageLoaded = true"
              @error="previewError = 'Failed to load image'"
            />
            <div
              v-if="!imageLoaded && !previewError"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="w-10 h-10 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
          </div>

          <!-- Video Preview (no inline playback due to Range request issues with presigned URLs) -->
          <div v-else-if="previewType === 'video'" class="w-full max-w-lg">
            <div class="p-8 rounded-2xl bg-bg-tertiary border border-border-subtle text-center">
              <component :is="fileIcon" class="w-20 h-20 text-purple-400 mx-auto mb-4" />
              <p class="text-lg font-medium text-text-primary mb-2 truncate">{{ item.name }}</p>
              <p class="text-sm text-text-secondary mb-6">
                {{ t('objects.preview.video_not_supported_full') }}
              </p>
              <div class="flex items-center justify-center gap-3">
                <UiButton
                  v-if="objectUrl"
                  variant="secondary"
                  @click="emit('open-new-tab')"
                >
                  <ExternalLink class="w-4 h-4" />
                  {{ t('objects.preview.open_in_browser') }}
                </UiButton>
                <UiButton variant="primary" @click="emit('download')">
                  <Download class="w-4 h-4" />
                  {{ t('objects.preview.download') }}
                </UiButton>
              </div>
            </div>
          </div>

          <!-- Audio Preview -->
          <div v-else-if="previewType === 'audio' && objectUrl" class="w-full max-w-lg">
            <div class="p-8 rounded-2xl bg-bg-tertiary border border-border-subtle">
              <component :is="fileIcon" class="w-20 h-20 text-green-400 mx-auto mb-6" />
              <p class="text-lg font-medium text-text-primary text-center mb-4 truncate">{{ item.name }}</p>
              <audio
                :src="objectUrl"
                controls
                autoplay
                class="w-full"
              >
                {{ t('objects.preview.audio_not_supported') }}
              </audio>
            </div>
          </div>

          <!-- PDF Preview -->
          <div v-else-if="previewType === 'pdf' && objectUrl" class="w-full h-full max-w-6xl">
            <iframe
              :src="objectUrl"
              class="w-full h-full rounded-lg border border-border-subtle"
              :title="t('objects.preview.details')"
            />
          </div>

          <!-- Code/Text Preview -->
          <div v-else-if="previewType === 'code'" class="w-full max-w-5xl h-full max-h-[calc(100vh-12rem)]">
            <ObjectCodePreview
              :url="objectUrl || null"
              :filename="item.name"
              :file-size="item.size"
              :max-size="1024 * 1024"
              max-height="calc(100vh - 14rem)"
              @download="emit('download')"
              @open-new-tab="emit('open-new-tab')"
            />
          </div>

          <!-- Unsupported File Type -->
          <div v-else class="w-full max-w-md">
            <div class="p-8 rounded-2xl bg-bg-tertiary border border-border-subtle text-center">
              <component :is="fileIcon" class="w-16 h-16 text-text-tertiary mx-auto mb-4" />
              <p class="text-lg font-medium text-text-primary mb-2">{{ item.name }}</p>
              <p class="text-sm text-text-secondary mb-6">
                {{ t('objects.preview.preview_not_available') }}
              </p>
              <div class="flex items-center justify-center gap-3">
                <UiButton variant="primary" @click="emit('download')">
                  <Download class="w-4 h-4" />
                  {{ t('objects.preview.download') }}
                </UiButton>
                <UiButton v-if="objectUrl" variant="secondary" @click="emit('open-new-tab')">
                  <ExternalLink class="w-4 h-4" />
                  {{ t('objects.preview.open_in_browser') }}
                </UiButton>
              </div>
            </div>
          </div>

          <!-- Error State -->
          <div v-if="previewError" class="absolute inset-0 flex items-center justify-center">
            <div class="p-8 rounded-2xl bg-error/10 border border-error/20 text-center">
              <p class="text-error mb-4">{{ previewError }}</p>
              <UiButton variant="secondary" @click="emit('download')">
                {{ t('objects.preview.download_instead') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Keyboard hints -->
        <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs text-text-tertiary">
          <span v-if="hasGallery" class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-white/10 rounded">←</kbd>
            <kbd class="px-1.5 py-0.5 bg-white/10 rounded">→</kbd>
            {{ t('objects.preview.navigate') }}
          </span>
          <span v-if="previewType === 'image'" class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-white/10 rounded">+</kbd>
            <kbd class="px-1.5 py-0.5 bg-white/10 rounded">-</kbd>
            {{ t('objects.preview.zoom') }}
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-white/10 rounded">Esc</kbd>
            {{ t('objects.preview.close') }}
          </span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
