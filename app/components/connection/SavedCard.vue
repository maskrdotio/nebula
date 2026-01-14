<script setup lang="ts">
import { computed, ref } from 'vue'
import { HardDrive, Trash2, ChevronRight, Clock, Pencil, Server } from 'lucide-vue-next'
import type { SavedConnection } from '~/types/connection'

const props = defineProps<{
  connection: SavedConnection
  selected?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [connection: SavedConnection]
  edit: [connection: SavedConnection]
  delete: [connection: SavedConnection]
}>()

const { t } = useI18n()

const showDeleteConfirm = ref(false)

/**
 * Get display-friendly endpoint (just the hostname).
 */
const displayEndpoint = computed(() => {
  try {
    const url = new URL(props.connection.endpoint)
    return url.host
  } catch {
    return props.connection.endpoint
  }
})

/**
 * Format the last connected date.
 */
const lastConnectedText = computed(() => {
  if (!props.connection.lastConnectedAt) {
    return t('connection.saved.never_used')
  }

  const date = new Date(props.connection.lastConnectedAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) {
    return t('connection.saved.just_now')
  } else if (diffMinutes < 60) {
    return t('connection.saved.minutes_ago', { count: diffMinutes })
  } else if (diffHours < 24) {
    return t('connection.saved.hours_ago', { count: diffHours })
  } else if (diffDays < 7) {
    return t('connection.saved.days_ago', { count: diffDays })
  } else {
    return date.toLocaleDateString()
  }
})

function handleClick() {
  if (!props.loading && !showDeleteConfirm.value) {
    emit('select', props.connection)
  }
}

function handleEditClick(event: Event) {
  event.stopPropagation()
  emit('edit', props.connection)
}

function handleDeleteClick(event: Event) {
  event.stopPropagation()
  showDeleteConfirm.value = true
}

function confirmDelete(event: Event) {
  event.stopPropagation()
  emit('delete', props.connection)
  showDeleteConfirm.value = false
}

function cancelDelete(event: Event) {
  event.stopPropagation()
  showDeleteConfirm.value = false
}
</script>

<template>
  <button
    type="button"
    class="w-full text-left p-4 rounded-xl border transition-all duration-150 group relative"
    :class="[
      selected
        ? 'bg-accent-primary/10 border-accent-primary/50'
        : 'bg-bg-secondary border-border-subtle hover:border-border-default hover:bg-bg-tertiary',
      loading ? 'opacity-50 cursor-wait' : 'cursor-pointer',
    ]"
    :disabled="loading"
    @click="handleClick"
  >
    <div class="flex items-start gap-3">
      <!-- Icon -->
      <div
        class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        :class="selected ? 'bg-accent-primary/20' : 'bg-bg-tertiary'"
      >
        <HardDrive
          class="w-5 h-5"
          :class="selected ? 'text-accent-primary' : 'text-text-secondary'"
          :stroke-width="1.5"
        />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Name and badges -->
        <div class="flex items-center gap-2">
          <span class="font-medium text-text-primary truncate">
            {{ connection.name }}
          </span>
          <!-- Proxy badge -->
          <span
            v-if="connection.useProxy"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-tertiary/20 text-accent-tertiary flex-shrink-0"
          >
            <Server class="w-3 h-3" />
            {{ t('connection.preset.proxied') }}
          </span>
        </div>

        <!-- Endpoint -->
        <p class="text-sm text-text-secondary mt-0.5 font-mono truncate">
          {{ displayEndpoint }}
        </p>

        <!-- Last connected -->
        <p class="text-xs text-text-tertiary mt-1 flex items-center gap-1">
          <Clock class="w-3 h-3" />
          {{ lastConnectedText }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1">
        <!-- Edit button -->
        <button
          v-if="!showDeleteConfirm"
          type="button"
          class="p-1.5 rounded-lg text-text-tertiary hover:text-accent-primary hover:bg-accent-primary/10 transition-colors opacity-0 group-hover:opacity-100"
          :title="t('connection.saved.edit')"
          @click="handleEditClick"
        >
          <Pencil class="w-4 h-4" />
        </button>

        <!-- Delete button -->
        <button
          v-if="!showDeleteConfirm"
          type="button"
          class="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100"
          :title="t('connection.saved.delete')"
          @click="handleDeleteClick"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <!-- Arrow -->
        <ChevronRight
          v-if="!showDeleteConfirm"
          class="flex-shrink-0 w-5 h-5 text-text-tertiary group-hover:text-text-secondary transition-colors"
          :class="{ 'text-accent-primary': selected }"
        />
      </div>
    </div>

    <!-- Delete confirmation overlay -->
    <Transition
      enter-active-class="transition-all duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showDeleteConfirm"
        class="absolute inset-0 rounded-xl bg-bg-secondary/95 backdrop-blur-sm flex items-center justify-center gap-3 p-4"
      >
        <span class="text-sm text-text-secondary">
          {{ t('connection.saved.delete_confirm') }}
        </span>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-lg bg-error text-white hover:bg-error/90 transition-colors"
          @click="confirmDelete"
        >
          {{ t('connection.saved.delete') }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-hover transition-colors"
          @click="cancelDelete"
        >
          {{ t('common.actions.cancel') }}
        </button>
      </div>
    </Transition>
  </button>
</template>
