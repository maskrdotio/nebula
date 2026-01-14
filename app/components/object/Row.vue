<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileJson,
  FileSpreadsheet,
  Download,
  Trash2,
  Link,
  Copy,
  ChevronRight,
  ImageOff,
} from 'lucide-vue-next'

const { t } = useI18n()

export interface ObjectItem {
  key: string
  name: string
  size: number
  lastModified: Date | undefined
  etag: string | undefined
  storageClass: string | undefined
  isFolder: boolean
}

interface Props {
  item: ObjectItem
  selected?: boolean
  checked?: boolean
  index?: number
  thumbnailUrl?: string
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  checked: false,
  index: 0,
})

const emit = defineEmits<{
  click: []
  dblclick: []
  download: []
  delete: []
  select: []
  'copy-url': []
  'copy-s3-uri': []
  'toggle-check': []
}>()

// Thumbnail state
const thumbnailLoaded = ref(false)
const thumbnailError = ref(false)

/** Extracts lowercase file extension from item name, empty for folders */
const fileExtension = computed(() => {
  if (props.item.isFolder) return ''
  return props.item.name.split('.').pop()?.toLowerCase() || ''
})

/** Determines if file type supports inline thumbnail preview */
const isImageFile = computed(() => {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(fileExtension.value)
})

/** Maps file extension to appropriate Lucide icon component */
const icon = computed(() => {
  if (props.item.isFolder) return Folder

  const ext = fileExtension.value

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif'].includes(ext)) {
    return FileImage
  }

  // Videos
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v'].includes(ext)) {
    return FileVideo
  }

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return FileAudio
  }

  // Archives
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'].includes(ext)) {
    return FileArchive
  }

  // JSON
  if (ext === 'json') {
    return FileJson
  }

  // Spreadsheets
  if (['csv', 'xls', 'xlsx', 'ods'].includes(ext)) {
    return FileSpreadsheet
  }

  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'less', 'html', 'xml', 'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'ps1', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'sql'].includes(ext)) {
    return FileCode
  }

  // Text/docs
  if (['txt', 'md', 'markdown', 'log', 'pdf', 'doc', 'docx', 'rtf', 'odt'].includes(ext)) {
    return FileText
  }

  return File
})

/** Returns Tailwind color class for icon based on file category */
const iconColor = computed(() => {
  if (props.item.isFolder) return 'text-amber-400'

  const ext = fileExtension.value

  // Images - blue
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'avif'].includes(ext)) {
    return 'text-blue-400'
  }

  // Videos - pink
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v'].includes(ext)) {
    return 'text-pink-400'
  }

  // Audio - cyan
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
    return 'text-cyan-400'
  }

  // Archives - purple
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz'].includes(ext)) {
    return 'text-purple-400'
  }

  // Code/text - green
  if (['js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'css', 'scss', 'less', 'html', 'xml', 'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'ps1', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'sql', 'json', 'txt', 'md', 'markdown', 'log'].includes(ext)) {
    return 'text-emerald-400'
  }

  // Documents - orange
  if (['pdf', 'doc', 'docx', 'rtf', 'odt', 'csv', 'xls', 'xlsx', 'ods'].includes(ext)) {
    return 'text-orange-400'
  }

  // Default - gray
  return 'text-text-tertiary'
})

/**
 * Converts byte count to human-readable size string.
 * Uses binary units (1024) with appropriate precision per scale.
 * @param { number } bytes - File size in bytes
 * @return { string } Formatted size (e.g., "1.5 MB", "256 KB")
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  if (i === 0) return `${bytes} B`

  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

/**
 * Formats date with human-friendly relative time for recent dates.
 * Shows "Just now", "N mins ago", "N hours ago", "N days ago", or short date format.
 * @param { Date | undefined } date - Date to format
 * @return { string } Relative time or formatted date string
 */
function formatDate(date: Date | undefined): string {
  if (!date) return '—'

  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60 * 1000) {
    return 'Just now'
  }

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000))
    return `${mins} min${mins === 1 ? '' : 's'} ago`
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000))
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  // Less than 30 days
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }

  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
  })
}

const formattedSize = computed(() => formatSize(props.item.size))
const formattedDate = computed(() => formatDate(props.item.lastModified))

// Zebra striping - very subtle
const isOddRow = computed(() => props.index % 2 === 1)
</script>

<template>
  <div
    :class="[
      'group flex items-center gap-3 px-4 h-11',
      'cursor-pointer transition-colors duration-100',
      // Zebra striping - very subtle 2% difference
      isOddRow ? 'bg-white/[0.02]' : 'bg-transparent',
      // Hover state
      'hover:bg-[#1e1e28]',
      // Selected state (clicked)
      selected && 'bg-accent-primary/10 !border-l-accent-primary',
      // Checked state (checkbox)
      checked && !selected && 'bg-blue-500/[0.08]',
      // Left border for selection indicator
      'border-l-2',
      selected ? 'border-l-accent-primary' : 'border-l-transparent',
    ]"
    @click="emit('click')"
    @dblclick="emit('dblclick')"
  >
    <!-- Checkbox -->
    <div class="flex-shrink-0 w-5" @click.stop>
      <label class="relative flex items-center justify-center cursor-pointer">
        <input
          type="checkbox"
          :checked="checked"
          class="peer sr-only"
          @change="emit('toggle-check')"
        />
        <div
          :class="[
            'w-[18px] h-[18px] rounded border-[1.5px] transition-all duration-100',
            'flex items-center justify-center',
            checked
              ? 'bg-accent-primary border-accent-primary'
              : 'border-border-default bg-transparent',
            !checked && 'opacity-0 group-hover:opacity-100',
            checked && 'opacity-100'
          ]"
        >
          <svg
            v-if="checked"
            class="w-3 h-3 text-white"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </label>
    </div>

    <!-- Icon / Thumbnail -->
    <div class="flex-shrink-0 w-8 h-8 flex items-center justify-center">
      <!-- Thumbnail for images -->
      <template v-if="isImageFile && thumbnailUrl">
        <div class="w-8 h-8 rounded overflow-hidden bg-bg-tertiary flex items-center justify-center">
          <img
            v-if="!thumbnailError"
            :src="thumbnailUrl"
            :alt="item.name"
            class="w-full h-full object-cover"
            loading="lazy"
            @load="thumbnailLoaded = true"
            @error="thumbnailError = true"
          />
          <ImageOff v-if="thumbnailError" class="w-4 h-4 text-text-tertiary" />
          <!-- Loading placeholder -->
          <div
            v-if="!thumbnailLoaded && !thumbnailError"
            class="w-full h-full bg-bg-tertiary animate-pulse"
          />
        </div>
      </template>
      <!-- Regular icon -->
      <template v-else>
        <component
          :is="icon"
          :class="[
            'w-5 h-5 transition-transform duration-100',
            iconColor,
            item.isFolder && 'group-hover:scale-110'
          ]"
        />
      </template>
    </div>

    <!-- Name -->
    <div class="flex-1 min-w-0 flex items-center gap-2">
      <span
        :class="[
          'truncate text-[13px]',
          item.isFolder ? 'text-text-primary font-medium' : 'text-text-primary'
        ]"
      >
        {{ item.name }}
      </span>
      <!-- Folder indicator -->
      <ChevronRight
        v-if="item.isFolder"
        class="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      />
    </div>

    <!-- Size -->
    <div class="w-20 text-right text-[13px] text-text-secondary font-mono flex-shrink-0 tabular-nums">
      {{ item.isFolder ? '—' : formattedSize }}
    </div>

    <!-- Last Modified -->
    <div class="w-28 text-right text-[13px] text-text-tertiary flex-shrink-0 hidden md:block">
      {{ item.isFolder ? '—' : formattedDate }}
    </div>

    <!-- Actions (visible on hover) -->
    <div
      :class="[
        'flex items-center gap-0.5 flex-shrink-0 w-[120px] justify-end',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-100'
      ]"
    >
      <template v-if="!item.isFolder">
        <!-- Download -->
        <button
          type="button"
          class="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors"
          :title="t('objects.row.download')"
          @click.stop="emit('download')"
        >
          <Download class="w-4 h-4" />
        </button>

        <!-- Copy URL -->
        <button
          type="button"
          class="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors"
          :title="t('objects.row.copy_url')"
          @click.stop="emit('copy-url')"
        >
          <Link class="w-4 h-4" />
        </button>

        <!-- Copy S3 URI -->
        <button
          type="button"
          class="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-white/[0.06] transition-colors"
          :title="t('objects.row.copy_s3_uri')"
          @click.stop="emit('copy-s3-uri')"
        >
          <Copy class="w-4 h-4" />
        </button>

        <!-- Delete -->
        <button
          type="button"
          class="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
          :title="t('objects.row.delete')"
          @click.stop="emit('delete')"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </template>
    </div>
  </div>
</template>
