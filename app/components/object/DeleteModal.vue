<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, File, Folder, Files } from 'lucide-vue-next'
import type { ObjectItem } from '~/components/object/Row.vue'

const { t } = useI18n()

interface Props {
  open: boolean
  /** Single item to delete */
  item?: ObjectItem | null
  /** Multiple items to delete (for bulk deletion) */
  items?: ObjectItem[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  item: null,
  items: () => [],
  loading: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

// Determine if this is a bulk delete or single item delete
const isBulkDelete = computed(() => props.items.length > 0)

// Count of items to delete
const itemCount = computed(() => {
  if (isBulkDelete.value) {
    return props.items.length
  }
  return props.item ? 1 : 0
})

// Get display name for single item
const itemName = computed(() => props.item?.name || '')

// Check if single item is a folder
const isFolder = computed(() => props.item?.isFolder || false)

function handleConfirm() {
  emit('confirm')
}

function handleClose() {
  emit('update:open', false)
}
</script>

<template>
  <UiModal
    :open="open"
    :title="isBulkDelete ? t('objects.delete.title_bulk') : t('objects.delete.title')"
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
          {{ isBulkDelete ? t('objects.delete.warning_bulk') : t('objects.delete.warning') }}
        </p>
      </div>

      <!-- Single item display -->
      <div v-if="!isBulkDelete && item" class="bg-bg-secondary border border-border-subtle rounded-lg p-3">
        <div class="flex items-center gap-3">
          <div :class="[
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            isFolder ? 'bg-amber-500/10' : 'bg-bg-tertiary'
          ]">
            <component
              :is="isFolder ? Folder : File"
              :class="['w-5 h-5', isFolder ? 'text-amber-400' : 'text-text-tertiary']"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text-primary font-medium truncate">{{ itemName }}</p>
            <p class="text-xs text-text-tertiary">
              {{ isFolder ? t('objects.delete.folder') : t('objects.delete.file') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Bulk items display -->
      <div v-else-if="isBulkDelete" class="bg-bg-secondary border border-border-subtle rounded-lg p-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center flex-shrink-0">
            <Files class="w-5 h-5 text-error" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text-primary font-medium">
              {{ t('objects.delete.items_count', itemCount) }}
            </p>
            <p class="text-xs text-text-tertiary">
              {{ t('objects.delete.cannot_undo') }}
            </p>
          </div>
        </div>
      </div>
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
        :loading="loading"
        @click="handleConfirm"
      >
        {{ isBulkDelete ? t('objects.delete.button_bulk', itemCount) : t('objects.delete.button') }}
      </UiButton>
    </template>
  </UiModal>
</template>
