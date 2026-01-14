<script setup lang="ts">
import { ref, watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import type { S3Bucket } from '~/composables/useS3Client'

const { t } = useI18n()

interface Props {
  open: boolean
  bucket: S3Bucket | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [bucket: S3Bucket]
}>()

const confirmText = ref('')

function handleConfirm() {
  if (!props.bucket || confirmText.value !== props.bucket.name) return
  emit('confirm', props.bucket)
}

function handleClose() {
  emit('update:open', false)
}

// Reset form when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    confirmText.value = ''
  }
})
</script>

<template>
  <UiModal
    :open="open"
    :title="t('buckets.delete.title')"
    size="sm"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4">
      <!-- Warning icon -->
      <div class="flex justify-center">
        <div class="w-14 h-14 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center">
          <AlertTriangle class="w-7 h-7 text-error" :stroke-width="1.5" />
        </div>
      </div>

      <!-- Warning message -->
      <div class="text-center">
        <p class="text-sm text-text-secondary">
          {{ t('buckets.delete.warning') }}
        </p>
      </div>

      <!-- Bucket name display -->
      <div class="bg-bg-secondary border border-border-subtle rounded-lg p-3 text-center">
        <p class="text-xs text-text-tertiary mb-1">{{ t('buckets.delete.label') }}</p>
        <p class="font-mono text-sm text-text-primary">{{ bucket?.name }}</p>
      </div>

      <!-- Confirmation input -->
      <UiInput
        v-model="confirmText"
        :label="t('buckets.delete.confirm_label')"
        :placeholder="bucket?.name ?? ''"
        autocomplete="off"
        monospace
      />
    </div>

    <template #footer>
      <UiButton
        variant="secondary"
        :disabled="loading"
        @click="handleClose"
      >
        {{ t('common.actions.cancel') }}
      </UiButton>
      <UiButton
        variant="danger"
        :disabled="confirmText !== bucket?.name"
        :loading="loading"
        @click="handleConfirm"
      >
        {{ t('buckets.delete.button') }}
      </UiButton>
    </template>
  </UiModal>
</template>
