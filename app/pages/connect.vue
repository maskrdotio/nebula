<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Orbit, Plus, Loader2 } from 'lucide-vue-next'
import { useConnectionStore } from '~/stores/connection'
import { usePresets } from '~/composables/usePresets'
import { useSavedConnections } from '~/composables/useSavedConnections'
import type { ConnectionPreset, SavedConnection } from '~/types/connection'

const { t } = useI18n()
const router = useRouter()
const store = useConnectionStore()
const { presets, loading: presetsLoading, fetchPresets } = usePresets()
const savedConnections = useSavedConnections()

// UI state
type ViewMode = 'list' | 'preset-credentials' | 'new-connection' | 'edit-connection'
const viewMode = ref<ViewMode>('list')
const selectedPreset = ref<ConnectionPreset | null>(null)
const editingConnection = ref<SavedConnection | null>(null)
const connectingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const successState = ref(false)

// Check if we have any saved connections or presets
const hasAnySources = computed(() => {
  return presets.value.length > 0 || savedConnections.sortedConnections.value.length > 0
})

// Initial load
onMounted(async () => {
  // Disconnect any existing connection to start fresh
  // This prevents state leakage when switching connections
  if (store.connected) {
    store.disconnect()
  }

  // Reset connection params to defaults (but don't clear saved connections)
  store.$patch({
    endpoint: '',
    accessKey: '',
    secretKey: '',
    region: 'us-east-1',
    pathStyle: true,
    error: null,
    source: 'manual',
    mode: 'direct',
    activePresetId: null,
    savedConnectionId: null,
  })

  // Initialize saved connections (handles migration)
  savedConnections.initialize()

  // Fetch presets from server
  await fetchPresets()
})

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * Handle preset selection.
 */
async function handlePresetSelect(preset: ConnectionPreset) {
  errorMessage.value = null
  successState.value = false

  // If proxy mode or has credentials, connect immediately
  if (preset.mode === 'proxy' || preset.hasCredentials) {
    connectingId.value = preset.id
    const result = await store.connectWithPreset(preset)

    if (result.success) {
      successState.value = true
      // Update last connection
      savedConnections.setLastConnection(preset.id, 'preset')
      // Navigate after brief delay
      setTimeout(() => {
        router.push('/')
      }, 500)
    } else {
      errorMessage.value = result.error ?? t('connection.error.failed')
      connectingId.value = null
    }
  } else {
    // Needs credentials - show credentials form
    selectedPreset.value = preset
    viewMode.value = 'preset-credentials'
  }
}

/**
 * Handle saved connection selection.
 */
async function handleSavedSelect(connection: SavedConnection) {
  errorMessage.value = null
  successState.value = false
  connectingId.value = connection.id

  const result = await store.connectWithSaved(connection)

  if (result.success) {
    successState.value = true
    // Update last connection
    savedConnections.setLastConnection(connection.id, 'local')
    savedConnections.updateLastConnected(connection.id)
    // Navigate after brief delay
    setTimeout(() => {
      router.push('/')
    }, 500)
  } else {
    errorMessage.value = result.error ?? t('connection.error.failed')
    connectingId.value = null
  }
}

/**
 * Handle saved connection delete.
 */
function handleSavedDelete(connection: SavedConnection) {
  savedConnections.remove(connection.id)
}

/**
 * Handle saved connection edit.
 */
function handleSavedEdit(connection: SavedConnection) {
  editingConnection.value = connection
  viewMode.value = 'edit-connection'
  errorMessage.value = null
  successState.value = false
}

/**
 * Handle credentials form submission for a preset.
 */
async function handlePresetCredentialsSubmit(data: { accessKey: string; secretKey: string }) {
  if (!selectedPreset.value) return

  errorMessage.value = null
  successState.value = false
  connectingId.value = selectedPreset.value.id

  const result = await store.connectWithPreset(selectedPreset.value, {
    accessKey: data.accessKey,
    secretKey: data.secretKey,
  })

  if (result.success) {
    successState.value = true
    savedConnections.setLastConnection(selectedPreset.value.id, 'preset')
    setTimeout(() => {
      router.push('/')
    }, 500)
  } else {
    errorMessage.value = result.error ?? t('connection.error.failed')
    connectingId.value = null
  }
}

/**
 * Handle new connection form submission.
 */
async function handleNewConnectionSubmit(data: {
  endpoint?: string
  accessKey: string
  secretKey: string
  region?: string
  pathStyle?: boolean
  rememberConnection?: boolean
  useProxy?: boolean
  connectionName?: string
}) {
  errorMessage.value = null
  successState.value = false
  connectingId.value = 'new'

  // Normalize endpoint
  let endpoint = data.endpoint?.trim() ?? ''
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`
  }
  endpoint = endpoint.replace(/\/$/, '')

  // Set params
  store.setConnectionParams({
    endpoint,
    accessKey: data.accessKey,
    secretKey: data.secretKey,
    region: data.region || 'us-east-1',
    pathStyle: data.pathStyle ?? true,
    rememberConnection: data.rememberConnection ?? false,
  })

  const result = await store.connect()

  if (result.success) {
    successState.value = true

    // Save to saved connections if remember is checked
    if (data.rememberConnection) {
      const saved = savedConnections.save({
        name: data.connectionName || new URL(endpoint).host,
        endpoint,
        accessKey: data.accessKey,
        secretKey: data.secretKey,
        region: data.region || 'us-east-1',
        pathStyle: data.pathStyle ?? true,
        useProxy: data.useProxy ?? false,
        lastConnectedAt: new Date().toISOString(),
      })
      savedConnections.setLastConnection(saved.id, 'local')
    }

    setTimeout(() => {
      router.push('/')
    }, 500)
  } else {
    errorMessage.value = result.error ?? t('connection.error.failed')
    connectingId.value = null
  }
}

/**
 * Handle edit connection form submission.
 */
async function handleEditConnectionSubmit(data: {
  endpoint?: string
  accessKey: string
  secretKey: string
  region?: string
  pathStyle?: boolean
  useProxy?: boolean
  connectionName?: string
}) {
  if (!editingConnection.value) return

  errorMessage.value = null
  successState.value = false
  connectingId.value = editingConnection.value.id

  // Normalize endpoint
  let endpoint = data.endpoint?.trim() ?? editingConnection.value.endpoint
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`
  }
  endpoint = endpoint.replace(/\/$/, '')

  // Reset mode to direct for testing (in case we were previously in proxy mode)
  // This ensures canConnect check works correctly
  store.$patch({
    mode: 'direct',
    activePresetId: null,
  })

  // Test connection with new credentials
  store.setConnectionParams({
    endpoint,
    accessKey: data.accessKey,
    secretKey: data.secretKey,
    region: data.region || 'us-east-1',
    pathStyle: data.pathStyle ?? true,
    rememberConnection: false,
  })

  const result = await store.testConnection()

  if (result.success) {
    successState.value = true

    // Clean up test clients (we're just validating, not connecting)
    store.disconnect()

    // Update the saved connection
    savedConnections.update(editingConnection.value.id, {
      name: data.connectionName || new URL(endpoint).host,
      endpoint,
      accessKey: data.accessKey,
      secretKey: data.secretKey,
      region: data.region || 'us-east-1',
      pathStyle: data.pathStyle ?? true,
      useProxy: data.useProxy ?? false,
    })

    // Navigate back to list after brief delay
    setTimeout(() => {
      viewMode.value = 'list'
      editingConnection.value = null
      connectingId.value = null
    }, 500)
  } else {
    // Clean up on failure too
    store.disconnect()
    errorMessage.value = result.error ?? t('connection.error.failed')
    connectingId.value = null
  }
}

/**
 * Cancel and return to list view.
 */
function handleCancel() {
  viewMode.value = 'list'
  selectedPreset.value = null
  editingConnection.value = null
  errorMessage.value = null
  successState.value = false
  connectingId.value = null
}

/**
 * Show new connection form.
 */
function showNewConnectionForm() {
  viewMode.value = 'new-connection'
  selectedPreset.value = null
  errorMessage.value = null
  successState.value = false
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-2xl animate-fade-in">
      <!-- Logo & Title -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-secondary border border-border-subtle mb-4">
          <Orbit class="w-8 h-8 text-accent-primary" :stroke-width="1.5" />
        </div>
        <h1 class="text-2xl font-semibold text-text-primary">{{ t('app.name') }}</h1>
        <p class="text-sm text-text-secondary mt-1">{{ t('connection.title') }}</p>
      </div>

      <!-- Loading presets -->
      <div v-if="presetsLoading" class="flex justify-center py-8">
        <Loader2 class="w-6 h-6 text-text-tertiary animate-spin" />
      </div>

      <!-- List View -->
      <div v-else-if="viewMode === 'list'" class="space-y-6">
        <!-- Presets Section -->
        <section v-if="presets.length > 0">
          <h2 class="text-sm font-medium text-text-secondary mb-3">
            {{ t('connection.sections.presets') }}
          </h2>
          <div class="space-y-2">
            <ConnectionPresetCard
              v-for="preset in presets"
              :key="preset.id"
              :preset="preset"
              :loading="connectingId === preset.id"
              @select="handlePresetSelect"
            />
          </div>
        </section>

        <!-- Saved Connections Section -->
        <section v-if="savedConnections.sortedConnections.value.length > 0">
          <h2 class="text-sm font-medium text-text-secondary mb-3">
            {{ t('connection.sections.saved') }}
          </h2>
          <div class="space-y-2">
            <ConnectionSavedCard
              v-for="conn in savedConnections.sortedConnections.value"
              :key="conn.id"
              :connection="conn"
              :loading="connectingId === conn.id"
              @select="handleSavedSelect"
              @edit="handleSavedEdit"
              @delete="handleSavedDelete"
            />
          </div>
        </section>

        <!-- New Connection Option -->
        <section>
          <h2 v-if="hasAnySources" class="text-sm font-medium text-text-secondary mb-3">
            {{ t('connection.sections.other') }}
          </h2>
          <button
            type="button"
            class="w-full p-4 border border-dashed border-border-default rounded-xl hover:border-accent-primary hover:bg-accent-primary/5 transition-all group"
            @click="showNewConnectionForm"
          >
            <div class="flex items-center justify-center gap-2 text-text-secondary group-hover:text-accent-primary transition-colors">
              <Plus class="w-5 h-5" />
              <span class="text-sm font-medium">
                {{ t('connection.new_connection') }}
              </span>
            </div>
          </button>
        </section>

        <!-- Error message -->
        <div
          v-if="errorMessage"
          class="p-4 rounded-lg bg-error/10 border border-error/20 text-sm text-error"
        >
          {{ errorMessage }}
        </div>
      </div>

      <!-- Preset Credentials Form -->
      <ConnectionCredentialsForm
        v-else-if="viewMode === 'preset-credentials' && selectedPreset"
        :preset="selectedPreset"
        :loading="connectingId === selectedPreset.id"
        :error="errorMessage"
        :success="successState"
        @submit="handlePresetCredentialsSubmit"
        @cancel="handleCancel"
      />

      <!-- New Connection Form -->
      <ConnectionCredentialsForm
        v-else-if="viewMode === 'new-connection'"
        full-form
        :loading="connectingId === 'new'"
        :error="errorMessage"
        :success="successState"
        @submit="handleNewConnectionSubmit"
        @cancel="handleCancel"
      />

      <!-- Edit Connection Form -->
      <ConnectionCredentialsForm
        v-else-if="viewMode === 'edit-connection' && editingConnection"
        :edit-connection="editingConnection"
        :loading="connectingId === editingConnection.id"
        :error="errorMessage"
        :success="successState"
        @submit="handleEditConnectionSubmit"
        @cancel="handleCancel"
      />

      <!-- Footer -->
      <p class="text-center text-xs text-text-tertiary mt-6">
        {{ t('app.tagline') }}
      </p>
    </div>
  </div>
</template>
