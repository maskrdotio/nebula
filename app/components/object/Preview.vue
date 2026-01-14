<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  X,
  Download,
  Trash2,
  Link,
  Copy,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  File,
  Clock,
  HardDrive,
  Hash,
  Box,
  Maximize2,
  ExternalLink,
  GripVertical,
} from 'lucide-vue-next'
import type { ObjectItem } from './Row.vue'

interface Props {
  item: ObjectItem | null
  bucket: string
  open: boolean
  objectUrl?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  close: []
  download: []
  delete: []
  'copy-url': []
  'copy-s3-uri': []
  expand: []
  'open-new-tab': []
}>()

const { t } = useI18n()

// Preview content
const previewContent = ref<string | null>(null)
const previewError = ref<string | null>(null)
const imageLoaded = ref(false)

// Resizable panel state
const panelWidth = ref(384) // Default 24rem = 384px
const minWidth = 280
const maxWidth = 640
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)

// Load saved panel width from localStorage
onMounted(() => {
  const savedWidth = localStorage.getItem('nebula-preview-panel-width')
  if (savedWidth) {
    const width = parseInt(savedWidth, 10)
    if (width >= minWidth && width <= maxWidth) {
      panelWidth.value = width
    }
  }
})

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
  if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'toml', 'json', 'sh', 'bash', 'md', 'txt', 'log', 'csv', 'sql', 'rb', 'php'].includes(ext)) {
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
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// S3 URI
const s3Uri = computed(() => {
  if (!props.item) return ''
  return `s3://${props.bucket}/${props.item.key}`
})

// Handle double-click on preview area to expand
function handlePreviewDoubleClick() {
  emit('expand')
}

// Open file in new tab
function handleOpenNewTab() {
  emit('open-new-tab')
}

// Resize handlers
function startResize(event: MouseEvent) {
  event.preventDefault()
  isResizing.value = true
  resizeStartX.value = event.clientX
  resizeStartWidth.value = panelWidth.value

  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResize(event: MouseEvent) {
  if (!isResizing.value) return

  // Calculate new width (resizing from left edge, so invert the delta)
  const delta = resizeStartX.value - event.clientX
  const newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStartWidth.value + delta))
  panelWidth.value = newWidth
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  // Save width to localStorage
  localStorage.setItem('nebula-preview-panel-width', panelWidth.value.toString())
}

// Keyboard shortcut for expand (Space key when preview is focused)
function handleKeydown(event: KeyboardEvent) {
  if (props.open && event.key === ' ' && event.target === document.body) {
    event.preventDefault()
    emit('expand')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // Cleanup resize listeners if component unmounts during resize
  if (isResizing.value) {
    stopResize()
  }
})

// Reset state when item changes
watch(() => props.item, () => {
  previewContent.value = null
  previewError.value = null
  imageLoaded.value = false
})
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    leave-active-class="transition-transform duration-200 ease-in"
    enter-from-class="translate-x-full"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="open && item"
      class="fixed right-0 top-0 h-full bg-bg-secondary border-l border-border-subtle shadow-2xl z-50 flex flex-col"
      :style="{ width: `${panelWidth}px` }"
    >
      <!-- Resize Handle -->
      <div
        class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group hover:bg-accent-primary/30 transition-colors z-10"
        :class="{ 'bg-accent-primary/50': isResizing }"
        @mousedown="startResize"
      >
        <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical class="w-4 h-4 text-text-tertiary" />
        </div>
      </div>

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-tertiary/50">
        <h3 class="font-medium text-text-primary truncate pr-2 flex-1 min-w-0">{{ item.name }}</h3>
        <div class="flex items-center gap-1 flex-shrink-0">
          <!-- Expand button -->
          <button
            type="button"
            class="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
            :title="t('objects.preview.expand')"
            @click="emit('expand')"
          >
            <Maximize2 class="w-4 h-4" />
          </button>
          <!-- Open in new tab -->
          <button
            v-if="objectUrl"
            type="button"
            class="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
            :title="t('objects.preview.open_new_tab')"
            @click="handleOpenNewTab"
          >
            <ExternalLink class="w-4 h-4" />
          </button>
          <!-- Close button -->
          <button
            type="button"
            class="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
            :title="t('objects.preview.close')"
            @click="emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Preview Area -->
      <div class="flex-1 overflow-y-auto">
        <!-- Image Preview -->
        <div
          v-if="previewType === 'image' && objectUrl"
          class="p-4 cursor-pointer"
          @dblclick="handlePreviewDoubleClick"
        >
          <div class="relative rounded-lg overflow-hidden bg-bg-primary border border-border-subtle group">
            <img
              :src="objectUrl"
              :alt="item.name"
              class="w-full h-auto max-h-64 object-contain"
              @load="imageLoaded = true"
              @error="previewError = 'Failed to load image'"
            />
            <div
              v-if="!imageLoaded && !previewError"
              class="absolute inset-0 flex items-center justify-center bg-bg-tertiary"
            >
              <div class="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <!-- Expand hint overlay -->
            <div class="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
              <div class="flex items-center gap-2 text-white text-sm">
                <Maximize2 class="w-4 h-4" />
                {{ t('objects.preview.double_click_expand') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Video Preview (no inline playback due to Range request issues with presigned URLs) -->
        <div
          v-else-if="previewType === 'video'"
          class="p-4"
          @dblclick="handlePreviewDoubleClick"
        >
          <div class="p-6 rounded-lg bg-bg-tertiary border border-border-subtle">
            <component :is="fileIcon" class="w-12 h-12 text-purple-400 mx-auto mb-3" />
            <p class="text-sm text-text-primary text-center font-medium mb-1 truncate">{{ item.name }}</p>
            <p class="text-xs text-text-tertiary text-center mb-4">
              {{ t('objects.preview.video_not_supported') }}
            </p>
            <div class="flex items-center justify-center gap-2">
              <UiButton
                v-if="objectUrl"
                variant="secondary"
                size="sm"
                @click.stop="handleOpenNewTab"
              >
                <ExternalLink class="w-4 h-4" />
                {{ t('objects.preview.open') }}
              </UiButton>
              <UiButton
                variant="primary"
                size="sm"
                @click.stop="emit('download')"
              >
                <Download class="w-4 h-4" />
                {{ t('objects.preview.download') }}
              </UiButton>
            </div>
          </div>
        </div>

        <!-- Audio Preview -->
        <div
          v-else-if="previewType === 'audio' && objectUrl"
          class="p-4"
          @dblclick="handlePreviewDoubleClick"
        >
          <div class="p-6 rounded-lg bg-bg-tertiary border border-border-subtle">
            <component :is="fileIcon" class="w-12 h-12 text-green-400 mx-auto mb-4" />
            <audio
              :src="objectUrl"
              controls
              class="w-full"
            >
              {{ t('objects.preview.audio_not_supported') }}
            </audio>
          </div>
        </div>

        <!-- PDF Preview -->
        <div
          v-else-if="previewType === 'pdf' && objectUrl"
          class="p-4"
          @dblclick="handlePreviewDoubleClick"
        >
          <div class="rounded-lg overflow-hidden border border-border-subtle h-64">
            <iframe
              :src="objectUrl"
              class="w-full h-full"
              :title="t('objects.preview.details')"
            />
          </div>
          <p class="text-xs text-text-tertiary text-center mt-2">
            {{ t('objects.preview.double_click_full_size') }}
          </p>
        </div>

        <!-- Code/Text Preview -->
        <div
          v-else-if="previewType === 'code'"
          class="p-4"
          @dblclick="handlePreviewDoubleClick"
        >
          <ObjectCodePreview
            :url="objectUrl || null"
            :filename="item.name"
            :file-size="item.size"
            :max-size="1024 * 1024"
            max-height="256px"
            @download="emit('download')"
            @open-new-tab="handleOpenNewTab"
          />
        </div>

        <!-- No Preview Available -->
        <div v-else class="p-4" @dblclick="handlePreviewDoubleClick">
          <div class="flex flex-col items-center justify-center py-8 px-4 rounded-lg bg-bg-tertiary border border-border-subtle">
            <component :is="fileIcon" class="w-12 h-12 text-text-tertiary mb-3" />
            <p class="text-sm text-text-secondary text-center">
              {{ t('objects.preview.preview_not_available') }}
            </p>
          </div>
        </div>

        <!-- File Details -->
        <div class="px-4 pb-4 space-y-3">
          <h4 class="text-xs font-medium text-text-tertiary uppercase tracking-wider">{{ t('objects.preview.details') }}</h4>

          <!-- Size -->
          <div class="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/50">
            <HardDrive class="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-text-tertiary">{{ t('objects.preview.size') }}</p>
              <p class="text-sm text-text-primary font-mono">{{ formatSize(item.size) }}</p>
            </div>
          </div>

          <!-- Last Modified -->
          <div class="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/50">
            <Clock class="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-text-tertiary">{{ t('objects.preview.last_modified') }}</p>
              <p class="text-sm text-text-primary">{{ formatDate(item.lastModified) }}</p>
            </div>
          </div>

          <!-- ETag -->
          <div v-if="item.etag" class="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/50">
            <Hash class="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-text-tertiary">{{ t('objects.preview.etag') }}</p>
              <p class="text-sm text-text-primary font-mono truncate">{{ item.etag }}</p>
            </div>
          </div>

          <!-- Storage Class -->
          <div v-if="item.storageClass" class="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/50">
            <Box class="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-text-tertiary">{{ t('objects.preview.storage_class') }}</p>
              <p class="text-sm text-text-primary">{{ item.storageClass }}</p>
            </div>
          </div>

          <!-- S3 URI -->
          <div class="flex items-center gap-3 py-2 px-3 rounded-lg bg-bg-tertiary/50">
            <Link class="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-text-tertiary">{{ t('objects.preview.s3_uri') }}</p>
              <p class="text-sm text-text-primary font-mono truncate">{{ s3Uri }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions Footer -->
      <div class="border-t border-border-subtle p-4 bg-bg-tertiary/30 space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <UiButton
            variant="secondary"
            size="sm"
            class="justify-center"
            @click="emit('copy-url')"
          >
            <Link class="w-4 h-4" />
            {{ t('objects.preview.copy_url') }}
          </UiButton>
          <UiButton
            variant="secondary"
            size="sm"
            class="justify-center"
            @click="emit('copy-s3-uri')"
          >
            <Copy class="w-4 h-4" />
            {{ t('objects.preview.copy_uri') }}
          </UiButton>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UiButton
            variant="primary"
            size="sm"
            class="justify-center"
            @click="emit('download')"
          >
            <Download class="w-4 h-4" />
            {{ t('objects.preview.download') }}
          </UiButton>
          <UiButton
            variant="danger"
            size="sm"
            class="justify-center"
            @click="emit('delete')"
          >
            <Trash2 class="w-4 h-4" />
            {{ t('common.actions.delete') }}
          </UiButton>
        </div>
      </div>
    </aside>
  </Transition>

  <!-- Backdrop -->
  <Transition
    enter-active-class="transition-opacity duration-300"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open && item"
      class="fixed inset-0 bg-black/50 z-40"
      @click="emit('close')"
    />
  </Transition>
</template>
