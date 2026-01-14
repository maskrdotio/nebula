import type { RawConnectionPreset, ConnectionPreset } from '../../app/types/connection'

// Node.js process type for server-side code
declare const process: { env: Record<string, string | undefined> }

// =============================================================================
// CONSTANTS
// =============================================================================

const ENV_PREFIX = 'NEBULA_RGW_'
const DEFAULT_REGION = 'us-east-1'

// =============================================================================
// CACHED PRESETS
// =============================================================================

let cachedPresets: RawConnectionPreset[] | null = null

// =============================================================================
// PARSING FUNCTIONS
// =============================================================================

/**
 * Parse NEBULA_RGW_{n}_* environment variables into presets.
 *
 * Environment variable pattern:
 *   NEBULA_RGW_{n}_NAME=Display name
 *   NEBULA_RGW_{n}_ENDPOINT=https://rgw.example.com (required)
 *   NEBULA_RGW_{n}_ACCESS_KEY=optional
 *   NEBULA_RGW_{n}_SECRET_KEY=optional
 *   NEBULA_RGW_{n}_REGION=us-east-1 (optional, defaults to us-east-1)
 *   NEBULA_RGW_{n}_PATH_STYLE=true (optional, defaults to true)
 *   NEBULA_RGW_{n}_PROXY=true/false (optional, defaults to false)
 *
 * Where {n} is 1, 2, 3, etc.
 */
export function parsePresets(): RawConnectionPreset[] {
  // Return cached presets if available
  if (cachedPresets !== null) {
    return cachedPresets
  }

  const presets: RawConnectionPreset[] = []
  const numbers = new Set<number>()

  // Find all preset numbers from environment by looking for ENDPOINT vars
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^NEBULA_RGW_(\d+)_ENDPOINT$/)
    if (match && match[1]) {
      numbers.add(parseInt(match[1], 10))
    }
  }

  // Parse each preset
  for (const n of Array.from(numbers).sort((a, b) => a - b)) {
    const prefix = `${ENV_PREFIX}${n}_`

    const endpoint = process.env[`${prefix}ENDPOINT`]
    if (!endpoint) {
      // This shouldn't happen since we found numbers from ENDPOINT, but be safe
      continue
    }

    const name = process.env[`${prefix}NAME`]
    const accessKey = process.env[`${prefix}ACCESS_KEY`]
    const secretKey = process.env[`${prefix}SECRET_KEY`]
    const region = process.env[`${prefix}REGION`] || DEFAULT_REGION
    const pathStyleEnv = process.env[`${prefix}PATH_STYLE`]
    const proxyEnv = process.env[`${prefix}PROXY`]

    // Parse boolean values (default pathStyle to true, proxy to false)
    const pathStyle = pathStyleEnv?.toLowerCase() !== 'false'
    const proxy = proxyEnv?.toLowerCase() === 'true'

    presets.push({
      id: `rgw_${n}`,
      name: name || `Connection ${n}`,
      endpoint: endpoint.trim(),
      accessKey: accessKey?.trim(),
      secretKey: secretKey?.trim(),
      region: region.trim(),
      pathStyle,
      proxy,
    })
  }

  // Cache the parsed presets
  cachedPresets = presets

  return presets
}

/**
 * Get a preset by its ID.
 * Returns undefined if the preset doesn't exist.
 */
export function getPresetById(id: string): RawConnectionPreset | undefined {
  const presets = parsePresets()
  return presets.find((p) => p.id === id)
}

/**
 * Check if a preset exists and is proxy-enabled.
 */
export function isProxyPreset(id: string): boolean {
  const preset = getPresetById(id)
  return preset?.proxy === true
}

/**
 * Sanitize a preset for client exposure.
 * - For proxy presets: removes credentials entirely
 * - For direct presets: includes credentials if provided
 */
export function sanitizePresetForClient(preset: RawConnectionPreset): ConnectionPreset {
  const hasCredentials = !!(preset.accessKey && preset.secretKey)

  if (preset.proxy) {
    // Proxy mode: never expose credentials to client
    return {
      id: preset.id,
      name: preset.name,
      endpoint: preset.endpoint,
      region: preset.region,
      pathStyle: preset.pathStyle,
      mode: 'proxy',
      hasCredentials,
    }
  }

  // Direct mode: include credentials if provided
  const sanitized: ConnectionPreset = {
    id: preset.id,
    name: preset.name,
    endpoint: preset.endpoint,
    region: preset.region,
    pathStyle: preset.pathStyle,
    mode: 'direct',
    hasCredentials,
  }

  if (hasCredentials) {
    sanitized.accessKey = preset.accessKey
    sanitized.secretKey = preset.secretKey
  }

  return sanitized
}

/**
 * Get all presets sanitized for client exposure.
 */
export function getClientPresets(): ConnectionPreset[] {
  return parsePresets().map(sanitizePresetForClient)
}

/**
 * Clear the cached presets (useful for testing).
 */
export function clearPresetCache(): void {
  cachedPresets = null
}
