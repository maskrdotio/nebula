<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  ArrowLeft,
  RefreshCw,
  Upload,
  LayoutList,
  LayoutGrid,
  Search,
  X,
  ShieldX,
  FolderOpen,
  Folder,
  File,
  Trash2,
  CheckSquare,
  Square,
  Settings,
} from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { useUploadsStore } from '~/stores/uploads'
import { useS3Client, type ListObjectsResult } from '~/composables/useS3Client'
import { useRgwAdmin } from '~/composables/useRgwAdmin'
import { useToast } from '~/stores/toast'
import type { ObjectItem } from '~/components/object/Row.vue'
import type { BucketStatsData } from '~/components/bucket/Stats.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const store = useConnectionStore()
const uploadsStore = useUploadsStore()
const s3 = useS3Client()
const admin = useRgwAdmin()
const toast = useToast()

// Parse route path
const pathSegments = computed(() => {
  const path = route.params['path']
  if (!path) return []
  if (typeof path === 'string') return [path]
  return path
})

const bucket = computed(() => pathSegments.value[0] || '')
const prefix = computed(() => {
  const segments = pathSegments.value.slice(1)
  if (segments.length === 0) return ''
  return segments.join('/') + '/'
})

// State
const objects = ref<ObjectItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const accessDenied = ref(false)
const searchQuery = ref('')
const viewMode = ref<'list' | 'grid'>('list')

// Selection state
const selectedItem = ref<ObjectItem | null>(null)
const checkedItems = ref<Set<string>>(new Set())

// Preview panel state
const showPreview = ref(false)
const previewObjectUrl = ref<string | null>(null)

// Maximized preview modal state
const showPreviewModal = ref(false)

// Pagination
const isTruncated = ref(false)
const nextContinuationToken = ref<string | undefined>(undefined)
const loadingMore = ref(false)

// File input ref for uploads
const fileInput = ref<HTMLInputElement | null>(null)

// Drag and drop state
const isDragging = ref(false)
const dragCounter = ref(0)

// Delete progress state
const deleteProgress = ref<{ current: number; total: number } | null>(null)

// Settings modal state
const showSettingsModal = ref(false)

// Delete confirmation modal state
const showDeleteModal = ref(false)
const deleteTarget = ref<{ item?: ObjectItem; items?: ObjectItem[] }>({})
const deleting = ref(false)

// Presigned URL cache for thumbnails
const thumbnailUrls = ref<Map<string, string>>(new Map())

// Bucket stats state
const bucketStats = ref<BucketStatsData>({
  isAdmin: false,
  loading: true,
  isSubfolder: false,
  bucketName: '',
})

// Filtered objects based on search
const filteredObjects = computed(() => {
  if (!searchQuery.value) return objects.value

  const query = searchQuery.value.toLowerCase()
  return objects.value.filter((obj) =>
    obj.name.toLowerCase().includes(query)
  )
})

// Sorted objects: folders first, then files
const sortedObjects = computed(() => {
  const folders = filteredObjects.value.filter((o) => o.isFolder)
  const files = filteredObjects.value.filter((o) => !o.isFolder)

  folders.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return [...folders, ...files]
})

// Check if all items are checked
const allChecked = computed(() => {
  const files = sortedObjects.value.filter(o => !o.isFolder)
  return files.length > 0 && files.every(o => checkedItems.value.has(o.key))
})

// Check if some (but not all) items are checked
const someChecked = computed(() => {
  return checkedItems.value.size > 0 && !allChecked.value
})

// Redirect if not connected
onMounted(async () => {
  if (!store.connected) {
    router.replace('/connect')
    return
  }

  if (!bucket.value) {
    router.replace('/buckets')
    return
  }

  // Setup drag and drop listeners
  document.addEventListener('dragenter', handleDragEnter)
  document.addEventListener('dragleave', handleDragLeave)
  document.addEventListener('dragover', handleDragOver)
  document.addEventListener('drop', handleDrop)

  // Load objects and bucket stats in parallel
  await Promise.all([
    loadObjects(),
    loadBucketStats(),
  ])
})

onUnmounted(() => {
  document.removeEventListener('dragenter', handleDragEnter)
  document.removeEventListener('dragleave', handleDragLeave)
  document.removeEventListener('dragover', handleDragOver)
  document.removeEventListener('drop', handleDrop)
})

// Reload when route changes
watch(
  () => route.params['path'],
  () => {
    if (store.connected && bucket.value) {
      loadObjects()
      // Clear selection when navigating
      selectedItem.value = null
      checkedItems.value = new Set()
      showPreview.value = false
      showPreviewModal.value = false
      // Reload bucket stats when bucket changes
      loadBucketStats()
    }
  }
)

// Load bucket stats from Admin API, fall back to calculated stats
async function loadBucketStats() {
  const isSubfolder = !!prefix.value

  bucketStats.value = {
    isAdmin: false,
    loading: true,
    isSubfolder,
    bucketName: bucket.value,
  }

  // Always try Admin API to get bucket-level info (owner, total size)
  const result = await admin.getBucketInfo(bucket.value)

  if (result.success && result.data) {
    // Admin API succeeded - we have full stats
    const data = result.data

    // Calculate totals from usage data
    let totalObjects = 0
    let totalSize = 0
    if (data.usage) {
      for (const category of Object.values(data.usage)) {
        totalObjects += category.numObjects || 0
        totalSize += category.size || 0
      }
    }

    bucketStats.value = {
      isAdmin: true,
      loading: false,
      isSubfolder,
      bucketName: bucket.value,
      owner: data.owner,
      totalObjects,
      totalSize,
      quotaEnabled: data.bucketQuota?.enabled,
      quotaMaxSize: data.bucketQuota?.maxSize,
      quotaMaxObjects: data.bucketQuota?.maxObjects,
      // For subfolders, these will be updated by updateFallbackStats
      currentObjects: 0,
      currentSize: 0,
    }
  } else {
    // Admin API failed (likely 403) - use fallback
    // Stats will be updated when objects are loaded
    bucketStats.value = {
      isAdmin: false,
      loading: false,
      isSubfolder,
      bucketName: bucket.value,
      currentObjects: 0,
      currentSize: 0,
    }
  }
}

// Update fallback stats from loaded objects (for non-admin users or subfolder view)
function updateFallbackStats() {
  // Only count files, not folders
  const files = objects.value.filter(o => !o.isFolder)
  const folderCount = objects.value.filter(o => o.isFolder).length
  const totalSize = files.reduce((sum, obj) => sum + obj.size, 0)

  // Update current folder stats (preserving bucket-level admin data if available)
  bucketStats.value = {
    ...bucketStats.value,
    currentObjects: files.length + folderCount,
    currentSize: totalSize,
  }
}

async function loadObjects(continuationToken?: string) {
  if (!continuationToken) {
    loading.value = true
    objects.value = []
    thumbnailUrls.value = new Map() // Clear thumbnail cache
  } else {
    loadingMore.value = true
  }

  error.value = null
  accessDenied.value = false

  const result = await s3.listObjects(bucket.value, prefix.value, {
    continuationToken,
    maxKeys: 1000,
  })

  if (result.success && result.data) {
    const newObjects = transformObjects(result.data)

    if (continuationToken) {
      objects.value = [...objects.value, ...newObjects]
    } else {
      objects.value = newObjects
    }

    isTruncated.value = result.data.isTruncated
    nextContinuationToken.value = result.data.nextContinuationToken

    // Update fallback stats for non-admin users
    updateFallbackStats()

    // Load presigned URLs for thumbnails (async, don't block)
    loadThumbnailUrls(newObjects)
  } else {
    // Check for access denied
    const errorMsg = result.error || 'Failed to load objects'
    if (errorMsg.includes('Access denied') || errorMsg.includes('AccessDenied')) {
      accessDenied.value = true
      error.value = "Access denied - you don't have permission to view objects in this bucket"
    } else {
      error.value = errorMsg
    }
  }

  loading.value = false
  loadingMore.value = false
}

function transformObjects(data: ListObjectsResult): ObjectItem[] {
  const items: ObjectItem[] = []

  // Add folders (common prefixes)
  for (const prefixPath of data.prefixes) {
    // Extract folder name from prefix
    const folderName = prefixPath.replace(prefix.value, '').replace(/\/$/, '')
    if (folderName) {
      items.push({
        key: prefixPath,
        name: folderName,
        size: 0,
        lastModified: undefined,
        etag: undefined,
        storageClass: undefined,
        isFolder: true,
      })
    }
  }

  // Add files (objects)
  for (const obj of data.objects) {
    // Skip the prefix itself (some S3 implementations return it)
    if (obj.key === prefix.value) continue

    // Extract file name from key
    const fileName = obj.key.replace(prefix.value, '')
    if (fileName && !fileName.includes('/')) {
      items.push({
        key: obj.key,
        name: fileName,
        size: obj.size,
        lastModified: obj.lastModified,
        etag: obj.etag,
        storageClass: obj.storageClass,
        isFolder: false,
      })
    }
  }

  return items
}

function navigateToPrefix(newPrefix: string) {
  if (newPrefix === '') {
    // Navigate to bucket root
    router.push(`/browse/${bucket.value}`)
  } else {
    // Remove trailing slash for URL
    const cleanPrefix = newPrefix.replace(/\/$/, '')
    router.push(`/browse/${bucket.value}/${cleanPrefix}`)
  }
}

function navigateUp() {
  if (!prefix.value) {
    // At bucket root, go to buckets list
    router.push('/buckets')
    return
  }

  // Go up one level
  const parts = prefix.value.split('/').filter(Boolean)
  parts.pop()
  const newPrefix = parts.length > 0 ? parts.join('/') + '/' : ''
  navigateToPrefix(newPrefix)
}

async function handleItemClick(item: ObjectItem) {
  if (item.isFolder) {
    navigateToPrefix(item.key)
  } else {
    // Select item and show preview
    selectedItem.value = item
    showPreview.value = true
    previewObjectUrl.value = null // Reset while loading

    // Generate presigned preview URL
    try {
      previewObjectUrl.value = await s3.getPresignedUrl(bucket.value, item.key, 3600)
    } catch {
      previewObjectUrl.value = null
    }
  }
}

function handleItemDblClick(item: ObjectItem) {
  if (item.isFolder) {
    navigateToPrefix(item.key)
  } else {
    handleDownload(item)
  }
}

function handleToggleCheck(item: ObjectItem) {
  if (checkedItems.value.has(item.key)) {
    checkedItems.value.delete(item.key)
  } else {
    checkedItems.value.add(item.key)
  }
  checkedItems.value = new Set(checkedItems.value) // Trigger reactivity
}

function toggleAllChecked() {
  const files = sortedObjects.value.filter(o => !o.isFolder)
  if (allChecked.value) {
    // Uncheck all
    checkedItems.value = new Set()
  } else {
    // Check all files
    checkedItems.value = new Set(files.map(f => f.key))
  }
}

async function handleDownload(item: ObjectItem) {
  const result = await s3.getObject(bucket.value, item.key)

  if (result.success && result.data?.body) {
    let blob: Blob

    if (result.data.body instanceof Blob) {
      blob = result.data.body
    } else if (result.data.body instanceof ReadableStream) {
      const reader = result.data.body.getReader()
      const chunks: ArrayBuffer[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value.buffer as ArrayBuffer)
      }

      blob = new Blob(chunks, { type: result.data.contentType || 'application/octet-stream' })
    } else {
      console.error('Unknown body type')
      return
    }

    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } else {
    toast.error({
      title: 'Download failed',
      message: result.error,
    })
  }
}

function handleDelete(item: ObjectItem) {
  deleteTarget.value = { item }
  showDeleteModal.value = true
}

async function confirmDelete() {
  deleting.value = true

  if (deleteTarget.value.items && deleteTarget.value.items.length > 0) {
    // Bulk delete
    await performBulkDelete(deleteTarget.value.items)
  } else if (deleteTarget.value.item) {
    // Single delete
    await performSingleDelete(deleteTarget.value.item)
  }

  deleting.value = false
  showDeleteModal.value = false
  deleteTarget.value = {}
}

async function performSingleDelete(item: ObjectItem) {
  const result = await s3.deleteObject(bucket.value, item.key)

  if (result.success) {
    // Close preview if this item was selected
    if (selectedItem.value?.key === item.key) {
      showPreview.value = false
      showPreviewModal.value = false
      selectedItem.value = null
    }
    await loadObjects()
  } else {
    toast.error({
      title: t('objects.delete.title'),
      message: result.error,
    })
  }
}

function handleDeleteChecked() {
  const count = checkedItems.value.size
  if (count === 0) return

  // Get the actual items from the checked keys
  const items = sortedObjects.value.filter(o => checkedItems.value.has(o.key))
  deleteTarget.value = { items }
  showDeleteModal.value = true
}

async function performBulkDelete(items: ObjectItem[]) {
  const keys = items.map(item => item.key)
  const count = keys.length
  deleteProgress.value = { current: 0, total: count }

  const result = await s3.deleteObjects(bucket.value, keys, (current, total) => {
    deleteProgress.value = { current, total }
  })

  deleteProgress.value = null

  if (result.success) {
    checkedItems.value = new Set()
    await loadObjects()
  } else if (result.data?.errors && result.data.errors.length > 0) {
    const failedCount = result.data.errors.length
    const successCount = result.data.deleted?.length || 0
    if (successCount > 0) {
      toast.warning({
        title: t('objects.delete.title_bulk'),
        message: t('browser.delete_partial_success', { success: successCount, failed: failedCount }),
      })
      checkedItems.value = new Set()
      await loadObjects()
    } else {
      toast.error({
        title: t('objects.delete.title_bulk'),
        message: result.data.errors[0]?.error || t('common.errors.unknown'),
      })
    }
  } else {
    toast.error({
      title: t('objects.delete.title_bulk'),
      message: result.error,
    })
  }
}

async function handleCopyUrl(item: ObjectItem) {
  try {
    const url = await s3.getPresignedUrl(bucket.value, item.key, 3600)
    await navigator.clipboard.writeText(url)
  } catch {
    console.error('Failed to copy URL')
  }
}

function handleCopyS3Uri(item: ObjectItem) {
  const uri = `s3://${bucket.value}/${item.key}`
  navigator.clipboard.writeText(uri)
}

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files

  if (!files || files.length === 0) return

  // Add files to upload store
  const uploadItems = uploadsStore.addFiles(bucket.value, prefix.value, Array.from(files))

  // Reset input
  input.value = ''

  // Process uploads
  await processUploads(uploadItems.map(item => item.id))
}

// Drag and drop handlers
function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value++
  if (event.dataTransfer?.types.includes('Files')) {
    isDragging.value = true
  }
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragging.value = false
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
  dragCounter.value = 0

  const items = event.dataTransfer?.items
  if (!items) return

  const filesWithPaths: Array<{ file: File; relativePath: string }> = []

  // Process each dropped item
  const processEntry = async (entry: FileSystemEntry, path: string = ''): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject)
      })
      filesWithPaths.push({ file, relativePath: path + file.name })
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry
      const reader = dirEntry.createReader()
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject)
      })
      for (const childEntry of entries) {
        await processEntry(childEntry, path + entry.name + '/')
      }
    }
  }

  // Collect all files from dropped items
  const promises: Promise<void>[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.kind === 'file') {
      const entry = item.webkitGetAsEntry()
      if (entry) {
        promises.push(processEntry(entry))
      }
    }
  }

  await Promise.all(promises)

  if (filesWithPaths.length === 0) return

  // Add files to upload store with their paths
  const uploadItems = uploadsStore.addFilesWithPaths(bucket.value, prefix.value, filesWithPaths)

  // Process uploads
  await processUploads(uploadItems.map(item => item.id))
}

// Process upload items
async function processUploads(uploadIds: string[]) {
  for (const id of uploadIds) {
    const item = uploadsStore.items.find(i => i.id === id)
    if (!item || item.status !== 'pending') continue

    // Create abort controller
    const abortController = new AbortController()
    uploadsStore.setAbortController(id, abortController)
    uploadsStore.updateStatus(id, 'uploading')

    const result = await s3.uploadFile(item.bucket, item.key, item.file, {
      contentType: item.file.type || 'application/octet-stream',
      abortSignal: abortController.signal,
      onProgress: (loaded, total) => {
        uploadsStore.updateProgress(id, loaded, total)
      },
    })

    if (result.success) {
      uploadsStore.updateStatus(id, 'completed')
    } else {
      // Check if cancelled
      if (abortController.signal.aborted) {
        uploadsStore.updateStatus(id, 'cancelled')
      } else {
        uploadsStore.updateStatus(id, 'failed', result.error || 'Upload failed')
      }
    }
  }

  // Reload objects after uploads complete
  await loadObjects()
}

function loadMore() {
  if (nextContinuationToken.value) {
    loadObjects(nextContinuationToken.value)
  }
}

function closePreview() {
  showPreview.value = false
  selectedItem.value = null
}

// Get list of previewable files (non-folders) for gallery mode
const previewableFiles = computed(() => {
  return sortedObjects.value.filter(o => !o.isFolder)
})

// Get current index in previewable files
const currentPreviewIndex = computed(() => {
  if (!selectedItem.value) return 0
  return previewableFiles.value.findIndex(f => f.key === selectedItem.value?.key)
})

// Handle expand to maximized view
function handleExpand() {
  if (selectedItem.value) {
    showPreviewModal.value = true
  }
}

// Handle open in new tab
function handleOpenNewTab() {
  if (previewObjectUrl.value) {
    window.open(previewObjectUrl.value, '_blank')
  }
}

// Handle gallery navigation
async function handleGalleryNavigate(index: number) {
  const files = previewableFiles.value
  if (index >= 0 && index < files.length) {
    const item = files[index]
    if (!item) return

    selectedItem.value = item
    previewObjectUrl.value = null // Reset while loading

    // Generate presigned URL
    try {
      previewObjectUrl.value = await s3.getPresignedUrl(bucket.value, item.key, 3600)
    } catch {
      previewObjectUrl.value = null
    }
  }
}

// Close maximized preview modal
function closePreviewModal() {
  showPreviewModal.value = false
}

// Helper for grid view size formatting
function formatGridSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

// Get icon component for grid view
function getItemIcon(item: ObjectItem) {
  return item.isFolder ? Folder : File
}

// Check if file is an image
function isImageFile(item: ObjectItem): boolean {
  if (item.isFolder) return false
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)
}

// Get cached thumbnail URL for image files
function getThumbnailUrl(item: ObjectItem): string | undefined {
  if (!isImageFile(item)) return undefined
  return thumbnailUrls.value.get(item.key)
}

// Generate presigned URLs for image thumbnails
async function loadThumbnailUrls(items: ObjectItem[]) {
  const imageItems = items.filter(isImageFile)
  if (imageItems.length === 0) return

  // Generate presigned URLs in parallel (limit concurrency)
  const batchSize = 10
  for (let i = 0; i < imageItems.length; i += batchSize) {
    const batch = imageItems.slice(i, i + batchSize)
    const urls = await Promise.all(
      batch.map(async (item) => {
        try {
          const url = await s3.getPresignedUrl(bucket.value, item.key, 3600)
          return { key: item.key, url }
        } catch {
          return { key: item.key, url: null }
        }
      })
    )
    urls.forEach(({ key, url }) => {
      if (url) {
        thumbnailUrls.value.set(key, url)
      }
    })
    // Trigger reactivity
    thumbnailUrls.value = new Map(thumbnailUrls.value)
  }
}
</script>

<template>
  <LayoutAppLayout full-width no-padding>
    <template #header>
      <header class="sticky top-0 z-40 bg-bg-primary/95 backdrop-blur-md border-b border-border-subtle shadow-lg shadow-black/10">
        <div class="px-6 py-3.5">
        <div class="flex items-center justify-between gap-4">
          <!-- Left: Navigation -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <UiButton
              variant="ghost"
              size="sm"
              icon
              @click="navigateUp"
              :title="t('objects.go_back')"
            >
              <ArrowLeft class="w-4 h-4" />
            </UiButton>

            <CommonBreadcrumbs
              :bucket="bucket"
              :prefix="prefix"
              @navigate="navigateToPrefix"
            />
          </div>

          <!-- Right: Actions -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Bulk actions when items are checked -->
            <template v-if="checkedItems.size > 0">
              <span class="text-sm text-text-secondary">
                {{ checkedItems.size }} {{ t('common.labels.selected') }}
              </span>
              <UiButton
                variant="danger"
                size="sm"
                @click="handleDeleteChecked"
              >
                <Trash2 class="w-4 h-4" />
                {{ t('common.actions.delete') }}
              </UiButton>
              <div class="w-px h-6 bg-border-subtle" />
            </template>

            <!-- Search -->
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="t('objects.filter_placeholder')"
                class="h-8 pl-9 pr-8 w-48 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 transition-all"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                @click="searchQuery = ''"
              >
                <X class="w-4 h-4" />
              </button>
            </div>

            <div class="w-px h-6 bg-border-subtle" />

            <!-- View mode toggle -->
            <div class="flex bg-bg-secondary rounded-lg border border-border-subtle p-0.5">
              <button
                type="button"
                :class="[
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'list'
                    ? 'bg-bg-tertiary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                ]"
                @click="viewMode = 'list'"
              >
                <LayoutList class="w-4 h-4" />
              </button>
              <button
                type="button"
                :class="[
                  'p-1.5 rounded-md transition-all',
                  viewMode === 'grid'
                    ? 'bg-bg-tertiary text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                ]"
                @click="viewMode = 'grid'"
              >
                <LayoutGrid class="w-4 h-4" />
              </button>
            </div>

            <div class="w-px h-6 bg-border-subtle" />

            <UiButton
              variant="ghost"
              size="sm"
              :disabled="loading"
              @click="loadObjects()"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
              <span class="hidden sm:inline">Refresh</span>
            </UiButton>

            <UiButton
              variant="primary"
              size="sm"
              :loading="uploadsStore.hasActiveUploads"
              @click="triggerUpload"
            >
              <Upload class="w-4 h-4" />
              Upload
            </UiButton>

            <UiButton
              variant="ghost"
              size="sm"
              :title="t('buckets.settings.title', { bucket: '' })"
              @click="showSettingsModal = true"
            >
              <Settings class="w-4 h-4" />
              <span class="hidden sm:inline">Settings</span>
            </UiButton>

            <!-- Hidden file input -->
            <input
              ref="fileInput"
              type="file"
              multiple
              class="hidden"
              @change="handleFileSelect"
            />
            </div>
        </div>
      </div>

      <!-- Bucket Stats Bar -->
      <BucketStats
        v-if="!accessDenied && !error"
        :stats="bucketStats"
      />
    </header>
  </template>

  <!-- Main content -->
  <div class="flex-1 px-6 pt-5 pb-8">
      <!-- Access Denied State -->
      <div
        v-if="accessDenied"
        class="min-h-[60vh] flex flex-col items-center justify-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mb-4">
          <ShieldX class="w-8 h-8 text-error" />
        </div>
        <h3 class="text-lg font-medium text-text-primary mb-2">Access Denied</h3>
        <p class="text-sm text-text-secondary text-center max-w-md mb-6">
          You don't have permission to view objects in this bucket.
          This may be because the bucket belongs to another user or your credentials don't have the required permissions.
        </p>
        <UiButton variant="secondary" @click="router.push('/buckets')">
          Back to Buckets
        </UiButton>
      </div>

      <!-- Error State -->
      <div
        v-else-if="error && !accessDenied"
        class="bg-error/10 border border-error/20 rounded-xl p-6 text-center"
      >
        <p class="text-error mb-4">{{ error }}</p>
        <UiButton variant="secondary" @click="loadObjects()">
          Try Again
        </UiButton>
      </div>

      <!-- Loading State -->
      <div
        v-else-if="loading"
        class="rounded-xl border border-border-subtle overflow-hidden bg-bg-secondary/30"
      >
        <!-- Header row skeleton -->
        <div class="flex items-center gap-3 px-4 py-2 bg-bg-secondary/60 border-b border-border-subtle">
          <UiSkeleton class="w-4 h-4" variant="rectangular" />
          <UiSkeleton class="w-5 h-5" variant="circular" />
          <UiSkeleton class="w-32 h-4" />
          <div class="flex-1" />
          <UiSkeleton class="w-16 h-4" />
          <UiSkeleton class="w-20 h-4" />
        </div>
        <!-- Row skeletons -->
        <div v-for="i in 10" :key="i" :class="['flex items-center gap-3 px-4 h-11', i % 2 === 1 ? 'bg-white/[0.02]' : 'bg-transparent']">
          <div class="w-5 flex justify-center">
            <UiSkeleton class="w-[18px] h-[18px]" variant="rectangular" />
          </div>
          <UiSkeleton class="w-8 h-8" variant="rectangular" />
          <UiSkeleton :class="['h-3.5', i % 3 === 0 ? 'w-64' : i % 3 === 1 ? 'w-48' : 'w-56']" />
          <div class="flex-1" />
          <UiSkeleton class="w-14 h-3.5" />
          <UiSkeleton class="w-20 h-3.5 hidden md:block" />
          <div class="w-[120px]" />
        </div>
      </div>

      <!-- Empty State -->
      <CommonEmptyState
        v-else-if="sortedObjects.length === 0 && !searchQuery"
        :icon="FolderOpen"
        :title="t('objects.empty_folder.title')"
        :description="t('objects.empty_folder.description')"
        :action-label="t('common.actions.upload')"
        @action="triggerUpload"
      />

      <!-- No search results -->
      <CommonEmptyState
        v-else-if="sortedObjects.length === 0 && searchQuery"
        :icon="Search"
        :title="t('objects.no_matches.title')"
        :description="t('objects.no_matches.description')"
      />

      <!-- Object List View -->
      <div
        v-else-if="viewMode === 'list'"
        class="rounded-xl border border-border-subtle overflow-hidden bg-bg-secondary/30"
      >
        <!-- Table header -->
        <div class="flex items-center gap-3 px-4 py-2 bg-bg-secondary/60 border-b border-border-subtle">
          <!-- Select all checkbox -->
          <button
            type="button"
            class="flex-shrink-0 p-0.5 rounded hover:bg-bg-hover transition-colors"
            @click="toggleAllChecked"
          >
            <component
              :is="allChecked ? CheckSquare : someChecked ? CheckSquare : Square"
              :class="[
                'w-4 h-4',
                allChecked || someChecked ? 'text-accent-primary' : 'text-text-tertiary'
              ]"
            />
          </button>
          <div class="w-8" />
          <div class="flex-1 text-xs text-text-tertiary uppercase tracking-wider font-medium">Name</div>
          <div class="w-20 text-right text-xs text-text-tertiary uppercase tracking-wider font-medium">Size</div>
          <div class="w-28 text-right text-xs text-text-tertiary uppercase tracking-wider font-medium hidden md:block">Modified</div>
          <div class="w-[120px]" />
        </div>

        <!-- Object rows -->
        <ObjectRow
          v-for="(item, index) in sortedObjects"
          :key="item.key"
          :item="item"
          :index="index"
          :selected="selectedItem?.key === item.key"
          :checked="checkedItems.has(item.key)"
          :thumbnail-url="getThumbnailUrl(item)"
          @click="handleItemClick(item)"
          @dblclick="handleItemDblClick(item)"
          @download="handleDownload(item)"
          @delete="handleDelete(item)"
          @copy-url="handleCopyUrl(item)"
          @copy-s3-uri="handleCopyS3Uri(item)"
          @toggle-check="handleToggleCheck(item)"
        />

        <!-- Load more -->
        <div
          v-if="isTruncated"
          class="flex justify-center py-4 bg-bg-secondary/30 border-t border-border-subtle"
        >
          <UiButton
            variant="ghost"
            size="sm"
            :loading="loadingMore"
            @click="loadMore"
          >
            Load more...
          </UiButton>
        </div>
      </div>

      <!-- Object Grid View -->
      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3"
      >
        <button
          v-for="item in sortedObjects"
          :key="item.key"
          type="button"
          :class="[
            'group relative flex flex-col items-center p-4 rounded-xl border transition-all text-center',
            selectedItem?.key === item.key
              ? 'bg-accent-primary/10 border-accent-primary/50 ring-1 ring-accent-primary/20'
              : 'bg-bg-secondary/50 border-border-subtle hover:border-border-default hover:bg-bg-tertiary'
          ]"
          @click="handleItemClick(item)"
          @dblclick="handleItemDblClick(item)"
        >
          <!-- Checkbox overlay for files -->
          <div
            v-if="!item.isFolder"
            class="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
            @click.stop="handleToggleCheck(item)"
          >
            <div
              :class="[
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                checkedItems.has(item.key)
                  ? 'bg-accent-primary border-accent-primary'
                  : 'border-border-default bg-bg-primary/80 hover:border-border-strong'
              ]"
            >
              <svg
                v-if="checkedItems.has(item.key)"
                class="w-3 h-3 text-white"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path
                  d="M2 6L5 9L10 3"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </div>

          <component
            :is="getItemIcon(item)"
            :class="[
              'w-10 h-10 mb-2 transition-transform group-hover:scale-110',
              item.isFolder ? 'text-amber-400' : 'text-text-tertiary'
            ]"
          />
          <span class="text-sm text-text-primary truncate max-w-full">
            {{ item.name }}
          </span>
          <span v-if="!item.isFolder" class="text-xs text-text-tertiary font-mono mt-1">
            {{ formatGridSize(item.size) }}
          </span>
        </button>

        <!-- Load more in grid -->
        <div
          v-if="isTruncated"
          class="col-span-full flex justify-center py-4"
        >
          <UiButton
            variant="ghost"
            size="sm"
            :loading="loadingMore"
            @click="loadMore"
          >
            Load more...
          </UiButton>
        </div>
      </div>

      <!-- Object count -->
      <p
        v-if="!loading && !error && sortedObjects.length > 0"
        class="mt-4 text-center text-xs text-text-tertiary"
      >
        {{ sortedObjects.length }} item{{ sortedObjects.length === 1 ? '' : 's' }}
        <span v-if="searchQuery" class="opacity-70">(filtered)</span>
        <span v-if="isTruncated" class="opacity-70">(more available)</span>
      </p>
    </div>

    <!-- Preview Panel -->
    <ObjectPreview
      :item="selectedItem"
      :bucket="bucket"
      :open="showPreview"
      :object-url="previewObjectUrl || undefined"
      @close="closePreview"
      @download="selectedItem && handleDownload(selectedItem)"
      @delete="selectedItem && handleDelete(selectedItem)"
      @copy-url="selectedItem && handleCopyUrl(selectedItem)"
      @copy-s3-uri="selectedItem && handleCopyS3Uri(selectedItem)"
      @expand="handleExpand"
      @open-new-tab="handleOpenNewTab"
    />

    <!-- Maximized Preview Modal -->
    <ObjectPreviewModal
      :item="selectedItem"
      :bucket="bucket"
      :open="showPreviewModal"
      :object-url="previewObjectUrl || undefined"
      :items="previewableFiles"
      :current-index="currentPreviewIndex"
      @close="closePreviewModal"
      @download="selectedItem && handleDownload(selectedItem)"
      @delete="selectedItem && handleDelete(selectedItem)"
      @copy-url="selectedItem && handleCopyUrl(selectedItem)"
      @copy-s3-uri="selectedItem && handleCopyS3Uri(selectedItem)"
      @open-new-tab="handleOpenNewTab"
      @navigate="handleGalleryNavigate"
    />

    <!-- Drag and drop overlay -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-150"
        leave-active-class="transition-opacity duration-100"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isDragging"
          class="fixed inset-0 z-[100] bg-bg-primary/80 backdrop-blur-sm flex items-center justify-center pointer-events-none"
        >
          <div class="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-accent-primary bg-accent-primary/10">
            <div class="w-16 h-16 rounded-2xl bg-accent-primary/20 flex items-center justify-center">
              <Upload class="w-8 h-8 text-accent-primary" />
            </div>
            <div class="text-center">
              <p class="text-lg font-medium text-text-primary">{{ t('browser.drag_drop.title') }}</p>
              <p class="text-sm text-text-secondary mt-1">{{ t('browser.drag_drop.description', { path: prefix || bucket }) }}</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Upload progress panel -->
    <UploadPanel />

    <!-- Delete progress overlay -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="opacity-0 translate-y-4"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="deleteProgress"
        class="fixed bottom-6 right-6 bg-bg-tertiary border border-border-default rounded-xl p-4 shadow-2xl min-w-72"
      >
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
            <Trash2 class="w-5 h-5 text-error animate-pulse" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text-primary font-medium">
              {{ t('browser.delete_progress', { current: deleteProgress.current, total: deleteProgress.total }) }}
            </p>
            <div class="mt-1.5 h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                class="h-full bg-error rounded-full transition-all duration-200"
                :style="{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Bucket Settings Modal -->
    <BucketSettingsModal
      v-model:open="showSettingsModal"
      :bucket="bucket"
      @refresh="loadObjects()"
    />

    <!-- Delete Confirmation Modal -->
    <ObjectDeleteModal
      :open="showDeleteModal"
      :item="deleteTarget.item"
      :items="deleteTarget.items || []"
      :loading="deleting"
      @update:open="showDeleteModal = $event"
      @confirm="confirmDelete"
    />
  </LayoutAppLayout>
</template>
