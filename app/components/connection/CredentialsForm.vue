<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-vue-next'
import type { ConnectionPreset, SavedConnection } from '~/types/connection'

const props = defineProps<{
  /** Preset being connected to (if any) - affects which fields are shown */
  preset?: ConnectionPreset | null
  /** Saved connection being edited (if any) */
  editConnection?: SavedConnection | null
  /** Whether to show the full form (endpoint, region, etc.) or just credentials */
  fullForm?: boolean
  /** Loading state */
  loading?: boolean
  /** Error message to display */
  error?: string | null
  /** Success state */
  success?: boolean
}>()

const emit = defineEmits<{
  submit: [data: {
    endpoint?: string
    accessKey: string
    secretKey: string
    region?: string
    pathStyle?: boolean
    rememberConnection?: boolean
    useProxy?: boolean
    connectionName?: string
  }]
  cancel: []
}>()

const { t } = useI18n()

// Form state
const connectionName = ref('')
const endpoint = ref('')
const accessKey = ref('')
const secretKey = ref('')
const region = ref('us-east-1')
const pathStyle = ref(true)
const useProxy = ref(false)
const rememberMe = ref(false)
const showStoredWarning = ref(false)

// Check if we're in edit mode
const isEditMode = computed(() => !!props.editConnection)

// Pre-fill from preset if provided
watch(() => props.preset, (preset) => {
  if (preset) {
    endpoint.value = preset.endpoint
    region.value = preset.region
    pathStyle.value = preset.pathStyle
    // Pre-fill credentials if available (direct mode with credentials)
    if (preset.accessKey) accessKey.value = preset.accessKey
    if (preset.secretKey) secretKey.value = preset.secretKey
  }
}, { immediate: true })

// Pre-fill from saved connection if editing
watch(() => props.editConnection, (connection) => {
  if (connection) {
    connectionName.value = connection.name
    endpoint.value = connection.endpoint
    accessKey.value = connection.accessKey
    secretKey.value = connection.secretKey
    region.value = connection.region
    pathStyle.value = connection.pathStyle
    useProxy.value = connection.useProxy ?? false
    rememberMe.value = true // Always true when editing
  }
}, { immediate: true })

function onRememberMeChange(value: boolean) {
  rememberMe.value = value
  showStoredWarning.value = value
}

function handleSubmit() {
  if (props.loading) return

  const data: {
    endpoint?: string
    accessKey: string
    secretKey: string
    region?: string
    pathStyle?: boolean
    rememberConnection?: boolean
    useProxy?: boolean
    connectionName?: string
  } = {
    accessKey: accessKey.value,
    secretKey: secretKey.value,
  }

  // Include full form data if showing full form or editing
  if (props.fullForm || isEditMode.value) {
    data.endpoint = endpoint.value
    data.region = region.value
    data.pathStyle = pathStyle.value
    data.useProxy = useProxy.value
    data.rememberConnection = isEditMode.value ? true : rememberMe.value
    if (connectionName.value.trim()) {
      data.connectionName = connectionName.value.trim()
    }
  }

  emit('submit', data)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <form
    class="bg-bg-secondary border border-border-subtle rounded-xl p-6 space-y-5"
    @submit.prevent="handleSubmit"
  >
    <!-- Header showing preset info if connecting to a preset -->
    <div v-if="preset && !fullForm && !isEditMode" class="pb-4 border-b border-border-subtle">
      <p class="text-sm text-text-secondary">
        {{ t('connection.preset.enter_credentials_for') }}
      </p>
      <p class="font-medium text-text-primary mt-1">{{ preset.name }}</p>
      <p class="text-xs text-text-tertiary font-mono mt-0.5">{{ preset.endpoint }}</p>
    </div>

    <!-- Header for edit mode -->
    <div v-if="isEditMode" class="pb-4 border-b border-border-subtle">
      <p class="text-sm text-text-secondary">
        {{ t('connection.saved.editing') }}
      </p>
      <p class="font-medium text-text-primary mt-1">{{ editConnection?.name }}</p>
    </div>

    <!-- Connection Name (edit mode or full form) -->
    <UiInput
      v-if="fullForm || isEditMode"
      v-model="connectionName"
      :label="t('connection.form.name_label')"
      :placeholder="t('connection.form.name_placeholder')"
      :hint="t('connection.form.name_hint')"
    />

    <!-- Endpoint (full form or edit mode) -->
    <UiInput
      v-if="fullForm || isEditMode"
      v-model="endpoint"
      :label="t('connection.form.endpoint_label')"
      placeholder="https://rgw.example.com"
      type="url"
      autocomplete="url"
      required
      :hint="t('connection.form.endpoint_hint')"
    />

    <!-- Access Key -->
    <UiInput
      v-model="accessKey"
      :label="t('connection.form.access_key_label')"
      placeholder="AKIAIOSFODNN7EXAMPLE"
      type="password"
      autocomplete="username"
      required
      monospace
    />

    <!-- Secret Key -->
    <UiInput
      v-model="secretKey"
      :label="t('connection.form.secret_key_label')"
      placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
      type="password"
      autocomplete="current-password"
      required
      monospace
    />

    <!-- Region (full form or edit mode) -->
    <UiInput
      v-if="fullForm || isEditMode"
      v-model="region"
      :label="t('connection.form.region_label')"
      placeholder="us-east-1"
      :hint="t('connection.form.region_hint')"
    />

    <!-- Divider (full form or edit mode) -->
    <div v-if="fullForm || isEditMode" class="border-t border-border-subtle" />

    <!-- Path Style Toggle (full form or edit mode) -->
    <UiToggle
      v-if="fullForm || isEditMode"
      v-model="pathStyle"
      :label="t('connection.form.path_style_label')"
      :description="t('connection.form.path_style_description')"
    />

    <!-- Proxy Toggle (full form or edit mode) -->
    <UiToggle
      v-if="fullForm || isEditMode"
      v-model="useProxy"
      :label="t('connection.form.use_proxy_label')"
      :description="t('connection.form.use_proxy_description')"
    />

    <!-- Remember Me Checkbox (full form only, not in edit mode) -->
    <div v-if="fullForm && !isEditMode" class="space-y-2">
      <UiCheckbox
        :model-value="rememberMe"
        :label="t('connection.form.remember_label')"
        @update:model-value="onRememberMeChange"
      />

      <!-- Security Warning -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="showStoredWarning"
          class="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20"
        >
          <AlertTriangle class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p class="text-xs text-warning/90">
            {{ t('connection.security_warning') }}
          </p>
        </div>
      </Transition>
    </div>

    <!-- Error Message -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="error"
        class="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20"
      >
        <XCircle class="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
        <p class="text-xs text-error">{{ error }}</p>
      </div>
    </Transition>

    <!-- Success Message -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="success"
        class="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20"
      >
        <CheckCircle2 class="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
        <p class="text-xs text-success">{{ t('connection.success') }}</p>
      </div>
    </Transition>

    <!-- Buttons -->
    <div class="flex gap-3">
      <UiButton
        type="button"
        variant="secondary"
        class="flex-1"
        @click="handleCancel"
      >
        {{ t('common.actions.cancel') }}
      </UiButton>
      <UiButton
        type="submit"
        variant="primary"
        class="flex-1"
        :loading="loading"
        :disabled="loading || success"
      >
        <template v-if="loading">
          {{ t('connection.button.testing') }}
        </template>
        <template v-else-if="success">
          {{ isEditMode ? t('connection.button.saved') : t('connection.button.connected') }}
        </template>
        <template v-else>
          {{ isEditMode ? t('connection.button.save') : t('connection.button.connect') }}
        </template>
      </UiButton>
    </div>
  </form>
</template>
