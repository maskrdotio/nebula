<script setup lang="ts">
import { computed } from 'vue'
import { Database, Trash2, ExternalLink, Copy, User } from 'lucide-vue-next'
import type { S3Bucket } from '~/composables/useS3Client'

const { t } = useI18n()

interface Props {
  bucket: S3Bucket
  owner?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  browse: [bucket: S3Bucket]
  delete: [bucket: S3Bucket]
  copyArn: [bucket: S3Bucket]
}>()

/**
 * Formats bucket creation date with relative time for recent dates.
 * Shows "Today", "Yesterday", "N days ago", etc. for recent buckets.
 */
const formattedDate = computed(() => {
  if (!props.bucket.creationDate) return t('common.status.unknown')

  const date = new Date(props.bucket.creationDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return t('common.time.today')
  } else if (diffDays === 1) {
    return t('common.time.yesterday')
  } else if (diffDays < 7) {
    return t('common.time.days_ago', diffDays)
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return t('common.time.weeks_ago', weeks)
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return t('common.time.months_ago', months)
  } else {
    return date.toLocaleDateString()
  }
})

/** Constructs AWS ARN format for the bucket */
const s3Arn = computed(() => `arn:aws:s3:::${props.bucket.name}`)

/**
 * Copies the bucket ARN to clipboard and emits event for toast feedback.
 */
function copyArn() {
  navigator.clipboard.writeText(s3Arn.value)
  emit('copyArn', props.bucket)
}
</script>

<template>
  <div
    class="group relative bg-bg-secondary border border-border-subtle rounded-xl p-4 transition-all duration-200 hover:border-border-default hover:bg-bg-tertiary cursor-pointer"
    @click="emit('browse', bucket)"
  >
    <!-- Header -->
    <div class="flex items-start gap-3">
      <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-bg-tertiary border border-border-subtle flex items-center justify-center group-hover:border-border-default transition-colors">
        <Database class="w-5 h-5 text-accent-primary" :stroke-width="1.5" />
      </div>

      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-text-primary truncate">
          {{ bucket.name }}
        </h3>
        <div class="flex items-center gap-2 mt-0.5">
          <p class="text-xs text-text-tertiary font-mono">
            {{ $t('common.time.created') }} {{ formattedDate }}
          </p>
          <template v-if="owner">
            <span class="text-text-tertiary">·</span>
            <span class="inline-flex items-center gap-1 text-xs text-text-tertiary">
              <User class="w-3 h-3" />
              <span class="font-mono">{{ owner }}</span>
            </span>
          </template>
        </div>
      </div>

      <!-- Actions menu -->
      <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-1.5 text-text-tertiary hover:text-text-secondary hover:bg-bg-hover rounded-md transition-colors"
            :title="$t('buckets.card.copy_arn')"
            @click.stop="copyArn"
          >
            <Copy class="w-4 h-4" />
          </button>
          <button
            type="button"
            class="p-1.5 text-text-tertiary hover:text-error hover:bg-error/10 rounded-md transition-colors"
            :title="$t('buckets.card.delete_bucket')"
            @click.stop="emit('delete', bucket)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Footer hint -->
    <div class="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
      <span class="text-xs text-text-tertiary">
        {{ $t('buckets.card.click_to_browse') }}
      </span>
      <ExternalLink class="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  </div>
</template>
