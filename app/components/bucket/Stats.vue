<script setup lang="ts">
import { computed } from 'vue'
import {
  User,
  Files,
  HardDrive,
  Clock,
  Gauge,
  FolderOpen,
  Database,
} from 'lucide-vue-next'

export interface BucketStatsData {
  // Admin API data (full stats)
  owner?: string
  totalObjects?: number
  totalSize?: number
  lastModified?: Date
  quotaEnabled?: boolean
  quotaMaxSize?: number
  quotaMaxObjects?: number
  // Fallback data (from ListObjects)
  currentObjects?: number
  currentSize?: number
  // Meta
  isAdmin: boolean
  loading: boolean
  // Context
  isSubfolder?: boolean
  bucketName?: string
}

interface Props {
  stats: BucketStatsData
}

const props = defineProps<Props>()

const { t } = useI18n()

/**
 * Converts byte count to human-readable size with 2 decimal places.
 * Supports units up to petabytes for large-scale storage display.
 * @param { number | undefined } bytes - Size in bytes
 * @return { string } Formatted size (e.g., "1.50 TB", "256.00 KB")
 */
function formatSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  if (i === 0) return `${bytes} B`
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`
}

/**
 * Formats number with locale-appropriate thousand separators.
 * @param { number | undefined } num - Number to format
 * @return { string } Formatted number or em-dash if undefined
 */
function formatNumber(num: number | undefined): string {
  if (num === undefined) return '—'
  return num.toLocaleString()
}

/**
 * Formats date in short US format for stats display.
 * @param { Date | undefined } date - Date to format
 * @return { string } Formatted date (e.g., "Jan 15, 2024") or em-dash
 */
function formatDate(date: Date | undefined): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Calculates bucket quota usage as percentage, null if quota not set */
const quotaUsagePercent = computed(() => {
  if (!props.stats.quotaEnabled || !props.stats.quotaMaxSize || !props.stats.totalSize) {
    return null
  }
  return Math.min(100, (props.stats.totalSize / props.stats.quotaMaxSize) * 100)
})

/** Selects object count source: admin API total or user-visible count */
const objectCount = computed(() => {
  return props.stats.isAdmin ? props.stats.totalObjects : props.stats.currentObjects
})

/** Selects size source: admin API total or user-visible folder size */
const sizeValue = computed(() => {
  return props.stats.isAdmin ? props.stats.totalSize : props.stats.currentSize
})
</script>

<template>
  <div class="bg-bg-secondary/40 border-t border-border-subtle/50">
    <div class="max-w-[1800px] mx-auto flex items-center gap-5 px-6 py-2.5 text-sm overflow-x-auto scrollbar-none">
    <!-- Loading state -->
    <template v-if="stats.loading">
      <div class="flex items-center gap-2 text-text-tertiary">
        <div class="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
        <span>{{ t('browser.stats.loading') }}</span>
      </div>
    </template>

    <template v-else>
      <!-- Subfolder view: show bucket info + folder stats -->
      <template v-if="stats.isSubfolder">
        <!-- Bucket indicator with owner if available -->
        <div class="flex items-center gap-1.5 text-text-secondary" :title="t('browser.stats.bucket')">
          <Database class="w-3.5 h-3.5 text-text-tertiary" />
          <span class="font-mono text-xs">{{ stats.bucketName }}</span>
          <template v-if="stats.owner">
            <span class="text-text-tertiary text-xs">{{ t('common.labels.by') }}</span>
            <span class="font-mono text-xs">{{ stats.owner }}</span>
          </template>
        </div>

        <!-- Separator -->
        <div class="w-px h-4 bg-border-subtle" />

        <!-- Bucket total size (if admin) -->
        <div
          v-if="stats.isAdmin && stats.totalSize !== undefined"
          class="flex items-center gap-1.5 text-text-secondary"
          :title="t('browser.stats.bucket_total_size')"
        >
          <HardDrive class="w-3.5 h-3.5 text-text-tertiary" />
          <span class="font-mono text-xs">{{ formatSize(stats.totalSize) }}</span>
          <span class="text-text-tertiary text-xs">{{ t('common.labels.total') }}</span>
        </div>

        <!-- Separator -->
        <div v-if="stats.isAdmin && stats.totalSize !== undefined" class="w-px h-4 bg-border-subtle" />

        <!-- This folder stats -->
        <div class="flex items-center gap-1.5 text-text-secondary" :title="t('browser.stats.this_folder')">
          <FolderOpen class="w-3.5 h-3.5 text-amber-400/70" />
          <span class="font-mono text-xs">{{ formatNumber(stats.currentObjects) }}</span>
          <span class="text-text-tertiary text-xs">{{ t('common.labels.items', stats.currentObjects || 0) }}</span>
          <span class="text-text-tertiary text-xs mx-0.5">/</span>
          <span class="font-mono text-xs">{{ formatSize(stats.currentSize) }}</span>
        </div>
      </template>

      <!-- Bucket root view: show full stats -->
      <template v-else>
        <!-- Owner (admin only) -->
        <div
          v-if="stats.isAdmin && stats.owner"
          class="flex items-center gap-1.5 text-text-secondary"
          :title="t('browser.stats.bucket_owner')"
        >
          <User class="w-3.5 h-3.5 text-text-tertiary" />
          <span class="font-mono text-xs">{{ stats.owner }}</span>
        </div>

        <!-- Separator -->
        <div v-if="stats.isAdmin && stats.owner" class="w-px h-4 bg-border-subtle" />

        <!-- Object count -->
        <div
          class="flex items-center gap-1.5 text-text-secondary"
          :title="t('browser.stats.total_objects')"
        >
          <Files class="w-3.5 h-3.5 text-text-tertiary" />
          <span class="font-mono text-xs">{{ formatNumber(objectCount) }}</span>
          <span class="text-text-tertiary text-xs">{{ t('common.labels.objects') }}</span>
        </div>

        <!-- Separator -->
        <div class="w-px h-4 bg-border-subtle" />

        <!-- Total size -->
        <div
          class="flex items-center gap-1.5 text-text-secondary"
          :title="t('browser.stats.total_size')"
        >
          <HardDrive class="w-3.5 h-3.5 text-text-tertiary" />
          <span class="font-mono text-xs">{{ formatSize(sizeValue) }}</span>
        </div>

        <!-- Admin-only fields -->
        <template v-if="stats.isAdmin">
          <!-- Last modified -->
          <template v-if="stats.lastModified">
            <div class="w-px h-4 bg-border-subtle" />
            <div
              class="flex items-center gap-1.5 text-text-secondary"
              :title="t('browser.stats.last_modified')"
            >
              <Clock class="w-3.5 h-3.5 text-text-tertiary" />
              <span class="text-xs">{{ formatDate(stats.lastModified) }}</span>
            </div>
          </template>

          <!-- Quota -->
          <template v-if="stats.quotaEnabled && stats.quotaMaxSize">
            <div class="w-px h-4 bg-border-subtle" />
            <div
              class="flex items-center gap-1.5 text-text-secondary"
              :title="t('browser.stats.quota_usage')"
            >
              <Gauge class="w-3.5 h-3.5 text-text-tertiary" />
              <div class="flex items-center gap-1.5">
                <!-- Progress bar -->
                <div class="w-16 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="[
                      quotaUsagePercent && quotaUsagePercent > 90
                        ? 'bg-error'
                        : quotaUsagePercent && quotaUsagePercent > 70
                          ? 'bg-warning'
                          : 'bg-accent-tertiary'
                    ]"
                    :style="{ width: `${quotaUsagePercent || 0}%` }"
                  />
                </div>
                <span class="text-xs font-mono">
                  {{ quotaUsagePercent?.toFixed(0) }}%
                </span>
                <span class="text-text-tertiary text-xs">
                  of {{ formatSize(stats.quotaMaxSize) }}
                </span>
              </div>
            </div>
          </template>
        </template>
      </template>
    </template>
    </div>
  </div>
</template>
