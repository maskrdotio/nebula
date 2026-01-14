<script setup lang="ts">
import { ref, watch } from 'vue'
import { CheckCircle2, Copy, Check, AlertTriangle, Key } from 'lucide-vue-next'
import type { CreateUserResult } from '~/composables/useRgwAdmin'

const { t } = useI18n()

interface Props {
  open: boolean
  user: CreateUserResult | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  done: []
}>()

const copiedAccessKey = ref(false)
const copiedSecretKey = ref(false)

async function copyToClipboard(text: string, type: 'access' | 'secret') {
  try {
    await navigator.clipboard.writeText(text)
    if (type === 'access') {
      copiedAccessKey.value = true
      setTimeout(() => { copiedAccessKey.value = false }, 2000)
    } else {
      copiedSecretKey.value = true
      setTimeout(() => { copiedSecretKey.value = false }, 2000)
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}

function handleDone() {
  emit('done')
  emit('update:open', false)
}

// Reset copy state when modal opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    copiedAccessKey.value = false
    copiedSecretKey.value = false
  }
})
</script>

<template>
  <UiModal
    :open="open"
    :title="t('users.credentials_modal.title')"
    size="md"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-6">
      <!-- Success icon -->
      <div class="flex justify-center">
        <div class="w-16 h-16 rounded-full bg-accent-tertiary/10 flex items-center justify-center">
          <CheckCircle2 class="w-8 h-8 text-accent-tertiary" />
        </div>
      </div>

      <!-- User info -->
      <div class="text-center">
        <h3 class="text-lg font-medium text-text-primary">{{ user?.displayName }}</h3>
        <p class="text-sm text-text-tertiary font-mono">{{ user?.userId }}</p>
      </div>

      <!-- Warning banner -->
      <div class="p-4 bg-warning/10 border border-warning/20 rounded-lg">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-medium text-warning">{{ t('users.credentials_modal.warning_title') }}</p>
            <p class="text-xs text-warning/80 mt-1">
              {{ t('users.credentials_modal.warning_description') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Credentials display -->
      <div v-if="user?.keys?.length && user.keys[0]" class="space-y-4">
        <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
          <Key class="w-4 h-4 text-text-tertiary" />
          {{ t('users.credentials_modal.credentials_section') }}
        </div>

        <!-- Access Key -->
        <div class="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-text-tertiary uppercase tracking-wider">{{ t('users.credentials_modal.access_key') }}</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
              @click="copyToClipboard(user.keys[0]?.accessKey ?? '', 'access')"
            >
              <component :is="copiedAccessKey ? Check : Copy" class="w-3.5 h-3.5" />
              {{ copiedAccessKey ? t('users.credentials_modal.copied') : t('users.credentials_modal.copy') }}
            </button>
          </div>
          <p class="font-mono text-sm text-text-primary break-all select-all">
            {{ user.keys[0]?.accessKey ?? '' }}
          </p>
        </div>

        <!-- Secret Key -->
        <div class="p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-text-tertiary uppercase tracking-wider">{{ t('users.credentials_modal.secret_key') }}</span>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
              @click="copyToClipboard(user.keys[0]?.secretKey ?? '', 'secret')"
            >
              <component :is="copiedSecretKey ? Check : Copy" class="w-3.5 h-3.5" />
              {{ copiedSecretKey ? t('users.credentials_modal.copied') : t('users.credentials_modal.copy') }}
            </button>
          </div>
          <p class="font-mono text-sm text-text-primary break-all select-all">
            {{ user.keys[0]?.secretKey ?? t('users.credentials_modal.not_available') }}
          </p>
        </div>
      </div>

      <!-- No keys message -->
      <div v-else class="p-4 bg-bg-secondary rounded-lg border border-border-subtle text-center">
        <p class="text-sm text-text-tertiary">{{ t('users.credentials_modal.no_credentials') }}</p>
      </div>
    </div>

    <template #footer>
      <UiButton
        variant="primary"
        @click="handleDone"
      >
        {{ t('users.credentials_modal.done') }}
      </UiButton>
    </template>
  </UiModal>
</template>
