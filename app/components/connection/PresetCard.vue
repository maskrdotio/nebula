<script setup lang="ts">
import { computed } from 'vue'
import { Server, Shield, Key, ChevronRight } from 'lucide-vue-next'
import type { ConnectionPreset } from '~/types/connection'

const props = defineProps<{
  preset: ConnectionPreset
  selected?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [preset: ConnectionPreset]
}>()

const { t } = useI18n()

/**
 * Get display-friendly endpoint (just the hostname).
 */
const displayEndpoint = computed(() => {
  try {
    const url = new URL(props.preset.endpoint)
    return url.host
  } catch {
    return props.preset.endpoint
  }
})

/**
 * Check if this preset needs credentials from the user.
 */
const needsCredentials = computed(() => {
  return props.preset.mode === 'direct' && !props.preset.hasCredentials
})

function handleClick() {
  if (!props.loading) {
    emit('select', props.preset)
  }
}
</script>

<template>
  <button
    type="button"
    class="w-full text-left p-4 rounded-xl border transition-all duration-150 group"
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
        <Server
          class="w-5 h-5"
          :class="selected ? 'text-accent-primary' : 'text-text-secondary'"
          :stroke-width="1.5"
        />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Name -->
        <div class="flex items-center gap-2">
          <span class="font-medium text-text-primary truncate">
            {{ preset.name }}
          </span>
          <!-- Badges -->
          <div class="flex items-center gap-1.5">
            <!-- Proxy badge -->
            <span
              v-if="preset.mode === 'proxy'"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-tertiary/20 text-accent-tertiary"
            >
              <Shield class="w-3 h-3" />
              {{ t('connection.preset.proxied') }}
            </span>
            <!-- Credentials required badge -->
            <span
              v-if="needsCredentials"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-warning/20 text-warning"
            >
              <Key class="w-3 h-3" />
              {{ t('connection.preset.credentials_required') }}
            </span>
          </div>
        </div>

        <!-- Endpoint -->
        <p class="text-sm text-text-secondary mt-0.5 font-mono truncate">
          {{ displayEndpoint }}
        </p>

        <!-- Region -->
        <p class="text-xs text-text-tertiary mt-1">
          {{ preset.region }}
        </p>
      </div>

      <!-- Arrow -->
      <ChevronRight
        class="flex-shrink-0 w-5 h-5 text-text-tertiary group-hover:text-text-secondary transition-colors"
        :class="{ 'text-accent-primary': selected }"
      />
    </div>
  </button>
</template>
