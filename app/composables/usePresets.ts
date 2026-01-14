import { ref, computed } from 'vue'
import type { ConnectionPreset } from '~/types/connection'

// =============================================================================
// STATE (module-level for singleton pattern)
// =============================================================================

const presets = ref<ConnectionPreset[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const fetched = ref(false)

// =============================================================================
// COMPOSABLE
// =============================================================================

/**
 * Composable for managing admin-configured connection presets.
 * Presets are defined via environment variables and provide pre-configured S3 endpoints.
 */
export function usePresets() {
  /**
   * Fetches available presets from /api/config/presets.
   * Results are cached until clearCache() is called or force=true.
   * @param { boolean } force - Bypass cache and refetch from server
   * @return { Promise<void> }
   */
  async function fetchPresets(force = false): Promise<void> {
    // Skip if already fetched (unless forced)
    if (fetched.value && !force) {
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await $fetch<ConnectionPreset[]>('/api/config/presets')
      presets.value = data
      fetched.value = true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch presets'
      error.value = errorMessage
      // Don't throw - allow the app to continue without presets
      console.warn('Failed to fetch connection presets:', errorMessage)
    } finally {
      loading.value = false
    }
  }

  /**
   * Finds a preset by its unique identifier.
   * @param { string } id - Preset ID to look up
   * @return { ConnectionPreset | undefined } Matching preset or undefined
   */
  function getPresetById(id: string): ConnectionPreset | undefined {
    return presets.value.find((p) => p.id === id)
  }

  /**
   * Determines if user must enter credentials for this preset (direct mode without server creds).
   * @param { ConnectionPreset } preset - Preset to check
   * @return { boolean } True if user credentials are required
   */
  function presetNeedsCredentials(preset: ConnectionPreset): boolean {
    return preset.mode === 'direct' && !preset.hasCredentials
  }

  /** Computed: True if at least one preset is configured */
  const hasPresets = computed(() => presets.value.length > 0)

  /** Computed: Presets using server-side proxy mode (credentials stored on server) */
  const proxyPresets = computed(() =>
    presets.value.filter((p) => p.mode === 'proxy')
  )

  /** Computed: Presets using direct browser-to-S3 mode */
  const directPresets = computed(() =>
    presets.value.filter((p) => p.mode === 'direct')
  )

  /**
   * Clears the preset cache, forcing a fresh fetch on next access.
   */
  function clearCache(): void {
    presets.value = []
    fetched.value = false
    error.value = null
  }

  return {
    // State
    presets,
    loading,
    error,
    fetched,

    // Computed
    hasPresets,
    proxyPresets,
    directPresets,

    // Methods
    fetchPresets,
    getPresetById,
    presetNeedsCredentials,
    clearCache,
  }
}
