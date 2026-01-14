import { getClientPresets } from '../../utils/presets'

/**
 * GET /api/config/presets
 *
 * Returns available connection presets configured via environment variables.
 * Credentials are sanitized:
 * - Proxy presets: credentials never exposed
 * - Direct presets: credentials included if provided
 */
export default defineEventHandler(() => {
  return getClientPresets()
})
