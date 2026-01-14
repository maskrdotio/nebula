import { defineStore } from 'pinia'

// =============================================================================
// TYPES
// =============================================================================

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled'

export interface UploadItem {
  id: string
  file: File
  bucket: string
  key: string
  status: UploadStatus
  progress: number  // 0-100
  bytesUploaded: number
  totalBytes: number
  error?: string
  abortController?: AbortController
  startedAt?: Date
  completedAt?: Date
}

export interface UploadsState {
  items: UploadItem[]
  isMinimized: boolean
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generates a unique identifier for upload tracking.
 * Combines timestamp with random string for collision avoidance.
 * @return { string } Unique upload item ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// =============================================================================
// STORE
// =============================================================================

export const useUploadsStore = defineStore('uploads', {
  state: (): UploadsState => ({
    items: [],
    isMinimized: false,
  }),

  getters: {
    /**
     * Filters to uploads currently in queue or actively transferring.
     * @return { UploadItem[] } Pending and uploading items
     */
    activeUploads(): UploadItem[] {
      return this.items.filter(item =>
        item.status === 'pending' || item.status === 'uploading'
      )
    },

    /**
     * Filters to successfully finished uploads.
     * @return { UploadItem[] } Completed items
     */
    completedUploads(): UploadItem[] {
      return this.items.filter(item => item.status === 'completed')
    },

    /**
     * Filters to uploads that encountered errors.
     * @return { UploadItem[] } Failed items
     */
    failedUploads(): UploadItem[] {
      return this.items.filter(item => item.status === 'failed')
    },

    /**
     * Indicates if any uploads are pending or in progress.
     * Used to show upload panel and prevent navigation away.
     * @return { boolean } True if uploads are active
     */
    hasActiveUploads(): boolean {
      return this.activeUploads.length > 0
    },

    /**
     * Calculates combined upload progress as a percentage.
     * Based on total bytes uploaded across all active items.
     * @return { number } Progress percentage (0-100)
     */
    overallProgress(): number {
      const active = this.activeUploads
      if (active.length === 0) return 0

      const totalBytes = active.reduce((sum, item) => sum + item.totalBytes, 0)
      const uploadedBytes = active.reduce((sum, item) => sum + item.bytesUploaded, 0)

      return totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0
    },

    /**
     * Determines if upload progress panel should be rendered.
     * @return { boolean } True if there are any uploads (active or completed)
     */
    showPanel(): boolean {
      return this.items.length > 0
    },
  },

  actions: {
    /**
     * Queues files for upload to the specified bucket and prefix.
     * Creates upload items with pending status for processing.
     * @param { string } bucket - Target bucket name
     * @param { string } prefix - Object key prefix (folder path)
     * @param { File[] } files - Array of File objects from input or drop
     * @return { UploadItem[] } Created upload queue items
     */
    addFiles(bucket: string, prefix: string, files: File[]): UploadItem[] {
      const newItems: UploadItem[] = files.map(file => ({
        id: generateId(),
        file,
        bucket,
        key: prefix + file.name,
        status: 'pending',
        progress: 0,
        bytesUploaded: 0,
        totalBytes: file.size,
      }))

      this.items.push(...newItems)
      return newItems
    },

    /**
     * Queues files preserving their folder hierarchy from drag-and-drop.
     * Uses relative paths to maintain directory structure in S3.
     * @param { string } bucket - Target bucket name
     * @param { string } prefix - Object key prefix (folder path)
     * @param { Array<{ file: File; relativePath: string }> } filesWithPaths - Files with their relative paths
     * @return { UploadItem[] } Created upload queue items
     */
    addFilesWithPaths(bucket: string, prefix: string, filesWithPaths: Array<{ file: File; relativePath: string }>): UploadItem[] {
      const newItems: UploadItem[] = filesWithPaths.map(({ file, relativePath }) => ({
        id: generateId(),
        file,
        bucket,
        key: prefix + relativePath,
        status: 'pending',
        progress: 0,
        bytesUploaded: 0,
        totalBytes: file.size,
      }))

      this.items.push(...newItems)
      return newItems
    },

    /**
     * Transitions an upload to a new state with optional error message.
     * Automatically sets startedAt/completedAt timestamps as appropriate.
     * @param { string } id - Upload item ID
     * @param { UploadStatus } status - New status to apply
     * @param { string } error - Optional error message for failed uploads
     */
    updateStatus(id: string, status: UploadStatus, error?: string) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        item.status = status
        if (error) item.error = error
        if (status === 'uploading' && !item.startedAt) {
          item.startedAt = new Date()
        }
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          item.completedAt = new Date()
        }
      }
    },

    /**
     * Updates bytes transferred for progress display.
     * Recalculates percentage automatically.
     * @param { string } id - Upload item ID
     * @param { number } bytesUploaded - Bytes successfully uploaded so far
     * @param { number } totalBytes - Total file size in bytes
     */
    updateProgress(id: string, bytesUploaded: number, totalBytes: number) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        item.bytesUploaded = bytesUploaded
        item.totalBytes = totalBytes
        item.progress = totalBytes > 0 ? Math.round((bytesUploaded / totalBytes) * 100) : 0
      }
    },

    /**
     * Associates an AbortController with an upload for cancellation support.
     * @param { string } id - Upload item ID
     * @param { AbortController } controller - Controller to abort the fetch request
     */
    setAbortController(id: string, controller: AbortController) {
      const item = this.items.find(i => i.id === id)
      if (item) {
        item.abortController = controller
      }
    },

    /**
     * Aborts an in-progress upload via its AbortController.
     * Marks the upload as cancelled and records completion time.
     * @param { string } id - Upload item ID to cancel
     */
    cancelUpload(id: string) {
      const item = this.items.find(i => i.id === id)
      if (item && item.abortController) {
        item.abortController.abort()
        item.status = 'cancelled'
        item.completedAt = new Date()
      }
    },

    /**
     * Removes an upload from the queue and UI.
     * Cancels the upload first if still in progress.
     * @param { string } id - Upload item ID to remove
     */
    removeUpload(id: string) {
      const index = this.items.findIndex(i => i.id === id)
      if (index !== -1) {
        // Cancel if still in progress
        const item = this.items[index]
        if (item && item.abortController && (item.status === 'pending' || item.status === 'uploading')) {
          item.abortController.abort()
        }
        this.items.splice(index, 1)
      }
    },

    /**
     * Removes all finished uploads (completed, failed, cancelled) from the list.
     * Keeps active uploads intact.
     */
    clearCompleted() {
      this.items = this.items.filter(item =>
        item.status === 'pending' || item.status === 'uploading'
      )
    },

    /**
     * Cancels all active uploads and clears the entire queue.
     * Used when disconnecting or leaving the page.
     */
    clearAll() {
      // Cancel all active uploads
      for (const item of this.items) {
        if (item.abortController && (item.status === 'pending' || item.status === 'uploading')) {
          item.abortController.abort()
        }
      }
      this.items = []
    },

    /**
     * Toggles the upload panel between expanded and minimized states.
     */
    toggleMinimized() {
      this.isMinimized = !this.isMinimized
    },
  },
})
