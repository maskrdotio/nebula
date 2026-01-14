<script setup lang="ts">
import { computed } from 'vue'
import {
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-vue-next'
import { useUploadsStore, type UploadItem } from '~/stores/uploads'

const store = useUploadsStore()

const activeCount = computed(() => store.activeUploads.length)
const completedCount = computed(() => store.completedUploads.length)
const failedCount = computed(() => store.failedUploads.length)

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

function getStatusIcon(item: UploadItem) {
  switch (item.status) {
    case 'pending': return Loader2
    case 'uploading': return Loader2
    case 'completed': return Check
    case 'failed': return AlertCircle
    case 'cancelled': return XCircle
    default: return Upload
  }
}

function getStatusColor(item: UploadItem) {
  switch (item.status) {
    case 'pending': return 'text-text-tertiary'
    case 'uploading': return 'text-accent-primary'
    case 'completed': return 'text-success'
    case 'failed': return 'text-error'
    case 'cancelled': return 'text-text-tertiary'
    default: return 'text-text-secondary'
  }
}

function handleCancel(item: UploadItem) {
  if (item.status === 'pending' || item.status === 'uploading') {
    store.cancelUpload(item.id)
  } else {
    store.removeUpload(item.id)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="store.showPanel"
        class="fixed bottom-4 right-4 w-96 bg-bg-secondary border border-border-subtle rounded-xl shadow-2xl z-50 overflow-hidden"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border-subtle cursor-pointer"
          @click="store.toggleMinimized"
        >
          <div class="flex items-center gap-3">
            <Upload class="w-4 h-4 text-accent-primary" />
            <span class="text-sm font-medium text-text-primary">
              {{ $t('uploads.title') }}
              <span v-if="activeCount > 0" class="text-text-secondary">
                {{ $t('uploads.active', { n: activeCount }) }}
              </span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Overall progress for active uploads -->
            <span v-if="activeCount > 0" class="text-xs font-mono text-text-secondary">
              {{ store.overallProgress }}%
            </span>
            <!-- Status badges -->
            <span v-if="completedCount > 0" class="text-xs text-success">
              {{ $t('uploads.done', { n: completedCount }) }}
            </span>
            <span v-if="failedCount > 0" class="text-xs text-error">
              {{ $t('uploads.failed', { n: failedCount }) }}
            </span>
            <!-- Toggle -->
            <component
              :is="store.isMinimized ? ChevronUp : ChevronDown"
              class="w-4 h-4 text-text-tertiary"
            />
          </div>
        </div>

        <!-- Content (when not minimized) -->
        <div v-if="!store.isMinimized" class="max-h-80 overflow-y-auto">
          <div class="divide-y divide-border-subtle">
            <div
              v-for="item in store.items"
              :key="item.id"
              class="px-4 py-3 hover:bg-bg-hover/50 transition-colors"
            >
              <div class="flex items-start gap-3">
                <!-- Status icon -->
                <component
                  :is="getStatusIcon(item)"
                  :class="[
                    'w-4 h-4 flex-shrink-0 mt-0.5',
                    getStatusColor(item),
                    (item.status === 'pending' || item.status === 'uploading') ? 'animate-spin' : ''
                  ]"
                />

                <!-- File info -->
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-text-primary truncate" :title="item.key">
                    {{ item.file.name }}
                  </p>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-text-tertiary font-mono">
                      {{ formatSize(item.bytesUploaded) }} / {{ formatSize(item.totalBytes) }}
                    </span>
                    <span v-if="item.error" class="text-xs text-error truncate" :title="item.error">
                      {{ item.error }}
                    </span>
                  </div>

                  <!-- Progress bar -->
                  <div
                    v-if="item.status === 'uploading' || item.status === 'pending'"
                    class="mt-2 h-1.5 bg-bg-primary rounded-full overflow-hidden"
                  >
                    <div
                      class="h-full bg-accent-primary transition-all duration-300"
                      :style="{ width: `${item.progress}%` }"
                    />
                  </div>
                </div>

                <!-- Cancel/Remove button -->
                <button
                  type="button"
                  class="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
                  :title="item.status === 'pending' || item.status === 'uploading' ? $t('uploads.cancel') : $t('uploads.remove')"
                  @click.stop="handleCancel(item)"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div
            v-if="store.items.length === 0"
            class="px-4 py-8 text-center text-text-tertiary text-sm"
          >
            {{ $t('uploads.no_uploads') }}
          </div>
        </div>

        <!-- Footer actions -->
        <div
          v-if="!store.isMinimized && (completedCount > 0 || failedCount > 0)"
          class="px-4 py-2 bg-bg-tertiary border-t border-border-subtle flex items-center justify-end gap-2"
        >
          <button
            type="button"
            class="text-xs text-text-secondary hover:text-text-primary transition-colors"
            @click="store.clearCompleted"
          >
            {{ $t('common.actions.clear_completed') }}
          </button>
          <button
            type="button"
            class="text-xs text-error hover:text-error/80 transition-colors flex items-center gap-1"
            @click="store.clearAll"
          >
            <Trash2 class="w-3 h-3" />
            {{ $t('common.actions.clear_all') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
