import { defineStore } from 'pinia'
import { useS3Client } from '~/composables/useS3Client'
import { useRgwAdmin } from '~/composables/useRgwAdmin'
import type { ConnectionSource, ConnectionMode, ConnectionPreset, SavedConnection, BackendType } from '~/types/connection'

// =============================================================================
// TYPES
// =============================================================================

export interface AdminCapabilities {
  buckets: boolean    // Can access /admin/bucket
  users: boolean      // Can access /admin/metadata/user
  usage: boolean      // Can access /admin/usage
  zone: boolean       // Can access /admin/realm or /admin/zone
  metadata: boolean   // Can access /admin/metadata
  probing: boolean    // Currently probing capabilities
}

export interface ConnectionHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  lastResponseTime: number | null  // ms
  lastCheckTime: Date | null
  errorCount: number
  recentErrors: string[]
}

export interface ConnectionState {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
  pathStyle: boolean
  connected: boolean
  connecting: boolean
  lastConnected: Date | null
  rememberConnection: boolean
  error: string | null
  // Admin capabilities detected after connect
  capabilities: AdminCapabilities
  // Connection health tracking
  health: ConnectionHealth
  // Ceph version from Server header (e.g., "Squid", "Reef")
  cephVersion: string | null
  // Multi-source connection support
  source: ConnectionSource       // 'local' | 'preset' | 'manual'
  mode: ConnectionMode           // 'direct' | 'proxy'
  activePresetId: string | null  // Preset ID if using a preset
  savedConnectionId: string | null // Saved connection ID if using local
  // Backend detection
  backendType: BackendType       // Detected storage backend type
  detectingBackend: boolean      // Currently detecting backend
}

interface StoredConnection {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
  pathStyle: boolean
  lastConnected: string | null
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'nebula_connection'
const DEFAULT_REGION = 'us-east-1'

// =============================================================================
// STORE
// =============================================================================

export const useConnectionStore = defineStore('connection', {
  state: (): ConnectionState => ({
    endpoint: '',
    accessKey: '',
    secretKey: '',
    region: DEFAULT_REGION,
    pathStyle: true,
    connected: false,
    connecting: false,
    lastConnected: null,
    rememberConnection: false,
    error: null,
    capabilities: {
      buckets: false,
      users: false,
      usage: false,
      zone: false,
      metadata: false,
      probing: false,
    },
    health: {
      status: 'unknown',
      lastResponseTime: null,
      lastCheckTime: null,
      errorCount: 0,
      recentErrors: [],
    },
    cephVersion: null,
    // Multi-source defaults
    source: 'manual',
    mode: 'direct',
    activePresetId: null,
    savedConnectionId: null,
    // Backend detection defaults
    backendType: 'unknown',
    detectingBackend: false,
  }),

  getters: {
    /**
     * Validates if all required connection parameters are present.
     * Proxy mode only needs a preset ID; direct mode requires endpoint and credentials.
     * @return { boolean } True if connection can be attempted
     */
    canConnect(): boolean {
      if (this.mode === 'proxy') {
        return !!this.activePresetId
      }
      return !!(this.endpoint && this.accessKey && this.secretKey)
    },

    /**
     * Indicates whether S3 requests are routed through the backend proxy.
     * @return { boolean } True if using server-side proxy for S3 operations
     */
    isProxyMode(): boolean {
      return this.mode === 'proxy'
    },

    /**
     * Extracts hostname from endpoint URL for safe display in UI.
     * Falls back to raw endpoint if URL parsing fails.
     * @return { string } Hostname portion of the endpoint (e.g., "s3.example.com")
     */
    displayEndpoint(): string {
      try {
        const url = new URL(this.endpoint)
        return url.host
      } catch {
        return this.endpoint
      }
    },

    /**
     * Checks if a connection exists in localStorage for auto-reconnect.
     * @return { boolean } True if stored credentials are available
     */
    hasStoredConnection(): boolean {
      if (typeof window === 'undefined') return false
      return localStorage.getItem(STORAGE_KEY) !== null
    },

    /**
     * Determines if the user has any RGW Admin API privileges.
     * Used to conditionally show admin features in the UI.
     * @return { boolean } True if at least one admin capability is detected
     */
    hasAnyAdminCap(): boolean {
      const c = this.capabilities
      return c.buckets || c.users || c.usage || c.zone || c.metadata
    },

    /**
     * Generates a human-readable list of detected admin permissions.
     * @return { string } Comma-separated capability names or "Standard user"
     */
    capabilitySummary(): string {
      const caps: string[] = []
      if (this.capabilities.buckets) caps.push('buckets')
      if (this.capabilities.users) caps.push('users')
      if (this.capabilities.usage) caps.push('usage')
      if (this.capabilities.zone) caps.push('zone')
      if (this.capabilities.metadata) caps.push('metadata')
      if (caps.length === 0) return 'Standard user'
      return `Admin: ${caps.join(', ')}`
    },

    /**
     * Identifies if the backend is Ceph RADOS Gateway (any variant).
     * @return { boolean } True for ceph-rgw or ceph-rgw-admin backends
     */
    isCephRgw(): boolean {
      return this.backendType === 'ceph-rgw-admin' || this.backendType === 'ceph-rgw'
    },

    /**
     * Indicates if RGW Admin API endpoints are accessible.
     * @return { boolean } True if backend is ceph-rgw-admin with working admin routes
     */
    hasAdminApi(): boolean {
      return this.backendType === 'ceph-rgw-admin'
    },

    /**
     * Controls visibility of user management navigation and features.
     * Requires both admin API access and user capability permission.
     * @return { boolean } True if user management should be accessible
     */
    showUsersFeature(): boolean {
      return this.backendType === 'ceph-rgw-admin' && this.capabilities.users
    },

    /**
     * Controls visibility of usage analytics and statistics features.
     * Requires both admin API access and usage capability permission.
     * @return { boolean } True if analytics features should be accessible
     */
    showAnalyticsFeature(): boolean {
      return this.backendType === 'ceph-rgw-admin' && this.capabilities.usage
    },

    /**
     * Controls visibility of bucket quota configuration features.
     * Requires both admin API access and bucket capability permission.
     * @return { boolean } True if quota features should be accessible
     */
    showBucketQuotaFeature(): boolean {
      return this.backendType === 'ceph-rgw-admin' && this.capabilities.buckets
    },

    /**
     * Controls visibility of zone and cluster information features.
     * Requires both admin API access and zone capability permission.
     * @return { boolean } True if cluster features should be accessible
     */
    showClusterFeature(): boolean {
      return this.backendType === 'ceph-rgw-admin' && this.capabilities.zone
    },
  },

  actions: {
    /**
     * Updates connection form fields without initiating a connection.
     * Useful for populating the form from presets or saved connections.
     * @param { object } params - Partial connection parameters to update
     * @param { string } params.endpoint - S3 endpoint URL
     * @param { string } params.accessKey - AWS access key ID
     * @param { string } params.secretKey - AWS secret access key
     * @param { string } params.region - AWS region (Ceph ignores but SDK requires)
     * @param { boolean } params.pathStyle - Use path-style URLs instead of virtual-hosted
     * @param { boolean } params.rememberConnection - Persist credentials to localStorage
     */
    setConnectionParams(params: {
      endpoint?: string
      accessKey?: string
      secretKey?: string
      region?: string
      pathStyle?: boolean
      rememberConnection?: boolean
    }) {
      if (params.endpoint !== undefined) this.endpoint = params.endpoint
      if (params.accessKey !== undefined) this.accessKey = params.accessKey
      if (params.secretKey !== undefined) this.secretKey = params.secretKey
      if (params.region !== undefined) this.region = params.region
      if (params.pathStyle !== undefined) this.pathStyle = params.pathStyle
      if (params.rememberConnection !== undefined) this.rememberConnection = params.rememberConnection
    },

    /**
     * Validates credentials by attempting a ListBuckets call without marking connected.
     * Used for "Test Connection" button to verify settings before committing.
     * @return { Promise<{ success: boolean; error?: string }> } Result with optional error message
     */
    async testConnection(): Promise<{ success: boolean; error?: string }> {
      if (!this.canConnect) {
        return { success: false, error: 'Missing connection parameters' }
      }

      this.error = null
      this.connecting = true

      try {
        const s3 = useS3Client()
        const admin = useRgwAdmin()

        const clientConfig = {
          endpoint: this.endpoint,
          accessKeyId: this.accessKey,
          secretAccessKey: this.secretKey,
          region: this.region,
          forcePathStyle: this.pathStyle,
        }

        // Initialize both S3 and Admin clients with current params
        s3.initializeClient(clientConfig)
        admin.initializeAdmin(clientConfig)

        // Test the connection
        const result = await s3.testConnection()

        if (!result.success) {
          this.error = result.error ?? 'Connection failed'
          s3.destroyClient()
          admin.destroyAdmin()
          return { success: false, error: this.error }
        }

        // Don't destroy clients, they will be used for the actual connection
        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed'
        this.error = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        this.connecting = false
      }
    },

    /**
     * Establishes a manual connection using form-entered credentials.
     * Initializes S3 and Admin clients, marks session as connected, and triggers backend detection.
     * @return { Promise<{ success: boolean; error?: string }> } Result with optional error message
     */
    async connect(): Promise<{ success: boolean; error?: string }> {
      // First test the connection
      const testResult = await this.testConnection()

      if (!testResult.success) {
        return testResult
      }

      // Set source info for manual connection
      this.source = 'manual'
      this.mode = 'direct'
      this.activePresetId = null
      this.savedConnectionId = null

      // Mark as connected
      this.connected = true
      this.lastConnected = new Date()
      this.error = null

      // Persist if requested
      if (this.rememberConnection) {
        this.persistConnection()
      }

      // Detect backend type and probe capabilities (don't await, run in background)
      this.detectBackend()

      return { success: true }
    },

    /**
     * Tests each RGW Admin API endpoint to discover user permissions.
     * Runs all probes in parallel for speed. Results determine which features are shown.
     * @return { Promise<void> }
     */
    async probeCapabilities(): Promise<void> {
      const admin = useRgwAdmin()

      this.capabilities = {
        buckets: false,
        users: false,
        usage: false,
        zone: false,
        metadata: false,
        probing: true,
      }

      // Probe all capabilities in parallel
      const [bucketsResult, usersResult, usageResult, zoneResult, metadataResult] = await Promise.all([
        admin.probeBucketCap(),
        admin.probeUserCap(),
        admin.probeUsageCap(),
        admin.probeZoneCap(),
        admin.probeMetadataCap(),
      ])

      this.capabilities = {
        buckets: bucketsResult,
        users: usersResult,
        usage: usageResult,
        zone: zoneResult,
        metadata: metadataResult,
        probing: false,
      }

      // After probing capabilities, determine backend type
      this.determineBackendType()
    },

    /**
     * Identifies the storage backend by probing for Ceph-specific features.
     * Distinguishes between ceph-rgw-admin (full admin), ceph-rgw (basic), and s3-compatible.
     * @return { Promise<void> }
     */
    async detectBackend(): Promise<void> {
      const s3 = useS3Client()
      const admin = useRgwAdmin()

      this.detectingBackend = true

      try {
        // First check if we already know it's Ceph from the Server header
        if (this.cephVersion) {
          // We know it's Ceph, now check admin capabilities
          // probeCapabilities() will call determineBackendType() when done
          await this.probeCapabilities()
          return
        }

        // Try to detect Ceph by making a simple admin API request
        // The response will tell us:
        // - Success or 403 → Ceph RGW (admin API exists)
        // - 404 or connection error → Not Ceph
        const result = await admin.detectCephRgw()

        if (result.isCeph) {
          // It's Ceph RGW
          if (result.hasAdminAccess) {
            // Has admin access, probe all capabilities
            await this.probeCapabilities()
          } else {
            // Ceph but no admin access
            this.backendType = 'ceph-rgw'
            s3.setBackendType('ceph-rgw')
            this.detectingBackend = false
          }
        } else {
          // Not Ceph - generic S3-compatible
          this.backendType = 's3-compatible'
          s3.setBackendType('s3-compatible')
          this.detectingBackend = false
        }
      } catch {
        // On any error, assume generic S3
        this.backendType = 's3-compatible'
        s3.setBackendType('s3-compatible')
        this.detectingBackend = false
      }
    },

    /**
     * Sets the final backend type based on capability probe results and Ceph version header.
     * Called automatically after probeCapabilities completes.
     */
    determineBackendType(): void {
      const s3 = useS3Client()
      const hasAnyCap = this.capabilities.buckets ||
                        this.capabilities.users ||
                        this.capabilities.usage ||
                        this.capabilities.zone ||
                        this.capabilities.metadata

      if (hasAnyCap) {
        // Has admin API access
        this.backendType = 'ceph-rgw-admin'
        s3.setBackendType('ceph-rgw-admin')
      } else if (this.cephVersion) {
        // Known Ceph but no admin
        this.backendType = 'ceph-rgw'
        s3.setBackendType('ceph-rgw')
      } else {
        // No indicators of Ceph
        this.backendType = 's3-compatible'
        s3.setBackendType('s3-compatible')
      }

      this.detectingBackend = false
    },

    /**
     * Terminates the current session and destroys S3/Admin client instances.
     * Resets capabilities, health tracking, and backend detection state.
     * Preserves credentials in state (use disconnectAndClear to fully reset).
     */
    disconnect() {
      const s3 = useS3Client()
      const admin = useRgwAdmin()
      s3.destroyClient()
      admin.destroyAdmin()

      this.connected = false
      this.error = null
      this.capabilities = {
        buckets: false,
        users: false,
        usage: false,
        zone: false,
        metadata: false,
        probing: false,
      }
      this.health = {
        status: 'unknown',
        lastResponseTime: null,
        lastCheckTime: null,
        errorCount: 0,
        recentErrors: [],
      }
      this.cephVersion = null
      this.backendType = 'unknown'
      this.detectingBackend = false
    },

    /**
     * Performs a full logout: disconnects session, clears localStorage, and resets all state.
     * Returns the UI to the initial connection screen state.
     */
    disconnectAndClear() {
      this.disconnect()
      this.clearStoredConnection()

      // Reset to defaults
      this.endpoint = ''
      this.accessKey = ''
      this.secretKey = ''
      this.region = DEFAULT_REGION
      this.pathStyle = true
      this.rememberConnection = false
      this.lastConnected = null
      // Reset multi-source properties
      this.source = 'manual'
      this.mode = 'direct'
      this.activePresetId = null
      this.savedConnectionId = null
    },

    /**
     * Connects using an admin-configured preset from environment variables.
     * Proxy presets route through backend; direct presets may require user credentials.
     * @param { ConnectionPreset } preset - The preset configuration to use
     * @param { object } credentials - User-provided credentials for direct presets without stored creds
     * @param { string } credentials.accessKey - AWS access key ID
     * @param { string } credentials.secretKey - AWS secret access key
     * @return { Promise<{ success: boolean; error?: string }> } Result with optional error message
     */
    async connectWithPreset(
      preset: ConnectionPreset,
      credentials?: { accessKey: string; secretKey: string }
    ): Promise<{ success: boolean; error?: string }> {
      const s3 = useS3Client()
      const admin = useRgwAdmin()

      this.error = null
      this.connecting = true

      try {
        // Set source info
        this.source = 'preset'
        this.activePresetId = preset.id
        this.savedConnectionId = null
        this.endpoint = preset.endpoint
        this.region = preset.region
        this.pathStyle = preset.pathStyle

        if (preset.mode === 'proxy') {
          // Proxy mode - enable proxy on clients
          this.mode = 'proxy'
          this.accessKey = ''
          this.secretKey = ''

          s3.enableProxyMode(preset.id)
          admin.enableProxyMode(preset.id)
        } else {
          // Direct mode - need credentials
          this.mode = 'direct'

          // Use provided credentials or preset credentials
          const accessKey = credentials?.accessKey || preset.accessKey
          const secretKey = credentials?.secretKey || preset.secretKey

          if (!accessKey || !secretKey) {
            this.connecting = false
            return { success: false, error: 'Credentials required for this preset' }
          }

          this.accessKey = accessKey
          this.secretKey = secretKey

          const clientConfig = {
            endpoint: preset.endpoint,
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            region: preset.region,
            forcePathStyle: preset.pathStyle,
          }

          s3.initializeClient(clientConfig)
          admin.initializeAdmin(clientConfig)
        }

        // Test the connection
        const result = await s3.testConnection()

        if (!result.success) {
          this.error = result.error ?? 'Connection failed'
          s3.destroyClient()
          admin.destroyAdmin()
          this.connecting = false
          return { success: false, error: this.error }
        }

        // Mark as connected
        this.connected = true
        this.lastConnected = new Date()
        this.error = null
        this.connecting = false

        // Detect backend type and probe capabilities (don't await, run in background)
        this.detectBackend()

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed'
        this.error = errorMessage
        this.connecting = false
        return { success: false, error: errorMessage }
      }
    },

    /**
     * Connects using a user-saved connection from localStorage.
     * Supports both direct and proxy modes based on the saved configuration.
     * @param { SavedConnection } connection - The saved connection to restore
     * @return { Promise<{ success: boolean; error?: string }> } Result with optional error message
     */
    async connectWithSaved(connection: SavedConnection): Promise<{ success: boolean; error?: string }> {
      const s3 = useS3Client()
      const admin = useRgwAdmin()

      this.error = null
      this.connecting = true

      try {
        // Set source info
        this.source = 'local'
        this.savedConnectionId = connection.id
        this.activePresetId = null

        // Set connection parameters
        this.endpoint = connection.endpoint
        this.accessKey = connection.accessKey
        this.secretKey = connection.secretKey
        this.region = connection.region
        this.pathStyle = connection.pathStyle

        // Check if proxy mode should be used
        if (connection.useProxy) {
          this.mode = 'proxy'

          // Enable proxy mode with credentials
          const proxyCredentials = {
            endpoint: connection.endpoint,
            accessKey: connection.accessKey,
            secretKey: connection.secretKey,
            region: connection.region,
            pathStyle: connection.pathStyle,
          }

          s3.enableProxyModeWithCredentials(proxyCredentials)
          admin.enableProxyModeWithCredentials(proxyCredentials)
        } else {
          this.mode = 'direct'

          const clientConfig = {
            endpoint: connection.endpoint,
            accessKeyId: connection.accessKey,
            secretAccessKey: connection.secretKey,
            region: connection.region,
            forcePathStyle: connection.pathStyle,
          }

          s3.initializeClient(clientConfig)
          admin.initializeAdmin(clientConfig)
        }

        // Test the connection
        const result = await s3.testConnection()

        if (!result.success) {
          this.error = result.error ?? 'Connection failed'
          s3.destroyClient()
          admin.destroyAdmin()
          this.connecting = false
          return { success: false, error: this.error }
        }

        // Mark as connected
        this.connected = true
        this.lastConnected = new Date()
        this.error = null
        this.connecting = false

        // Detect backend type and probe capabilities (don't await, run in background)
        this.detectBackend()

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Connection failed'
        this.error = errorMessage
        this.connecting = false
        return { success: false, error: errorMessage }
      }
    },

    /**
     * Saves current connection credentials to localStorage for auto-reconnect.
     * WARNING: Stores credentials in plain text - only use when user explicitly opts in.
     */
    persistConnection() {
      if (typeof window === 'undefined') return

      const data: StoredConnection = {
        endpoint: this.endpoint,
        accessKey: this.accessKey,
        secretKey: this.secretKey,
        region: this.region,
        pathStyle: this.pathStyle,
        lastConnected: this.lastConnected?.toISOString() ?? null,
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch (error) {
        console.error('Failed to persist connection:', error)
      }
    },

    /**
     * Restores connection parameters from localStorage into state.
     * Does not initiate a connection - call connect() separately.
     * @return { boolean } True if stored credentials were found and loaded
     */
    loadStoredConnection(): boolean {
      if (typeof window === 'undefined') return false

      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return false

        const data = JSON.parse(stored) as StoredConnection

        this.endpoint = data.endpoint
        this.accessKey = data.accessKey
        this.secretKey = data.secretKey
        this.region = data.region
        this.pathStyle = data.pathStyle
        this.lastConnected = data.lastConnected ? new Date(data.lastConnected) : null
        this.rememberConnection = true

        return true
      } catch (error) {
        console.error('Failed to load stored connection:', error)
        this.clearStoredConnection()
        return false
      }
    },

    /**
     * Removes saved credentials from localStorage.
     * Called during logout to prevent auto-reconnect on next visit.
     */
    clearStoredConnection() {
      if (typeof window === 'undefined') return

      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch (error) {
        console.error('Failed to clear stored connection:', error)
      }
    },

    /**
     * Loads stored credentials and attempts automatic connection.
     * Used on app startup when "remember connection" was previously enabled.
     * @return { Promise<{ success: boolean; error?: string }> } Result with optional error message
     */
    async reconnect(): Promise<{ success: boolean; error?: string }> {
      const loaded = this.loadStoredConnection()
      if (!loaded) {
        return { success: false, error: 'No stored connection found' }
      }

      return this.connect()
    },

    /**
     * Tracks a successful API call for connection health monitoring.
     * Decrements error count and updates health status based on response latency.
     * @param { number } responseTimeMs - API response time in milliseconds
     */
    recordApiSuccess(responseTimeMs: number) {
      this.health.lastResponseTime = responseTimeMs
      this.health.lastCheckTime = new Date()
      this.health.errorCount = Math.max(0, this.health.errorCount - 1)

      // Determine health status based on response time and error count
      if (this.health.errorCount === 0 && responseTimeMs < 1000) {
        this.health.status = 'healthy'
      } else if (this.health.errorCount < 3 && responseTimeMs < 3000) {
        this.health.status = 'degraded'
      } else {
        this.health.status = 'degraded'
      }
    },

    /**
     * Tracks a failed API call for connection health monitoring.
     * Increments error count, stores recent error messages, and may degrade health status.
     * @param { string } errorMessage - Description of the error that occurred
     */
    recordApiError(errorMessage: string) {
      this.health.lastCheckTime = new Date()
      this.health.errorCount += 1
      this.health.recentErrors = [
        errorMessage,
        ...this.health.recentErrors.slice(0, 4),
      ]

      if (this.health.errorCount >= 5) {
        this.health.status = 'unhealthy'
      } else if (this.health.errorCount >= 2) {
        this.health.status = 'degraded'
      }
    },

    /**
     * Extracts and stores Ceph version from HTTP Server header.
     * Parses format like "Ceph Object Gateway (squid)" into display name "Squid".
     * @param { string } serverHeader - Raw Server header value from RGW response
     */
    setCephVersion(serverHeader: string) {
      // Already set, no need to update
      if (this.cephVersion) return

      // Parse "Ceph Object Gateway (squid)" or similar
      const match = serverHeader.match(/\(([^)]+)\)/)
      if (match?.[1]) {
        // Capitalize first letter: "squid" -> "Squid"
        const version = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
        this.cephVersion = version
      }
    },

    /**
     * Performs a lightweight health check by listing buckets.
     * Updates health metrics based on response time and success/failure.
     * @return { Promise<void> }
     */
    async checkHealth(): Promise<void> {
      if (!this.connected) {
        this.health.status = 'unknown'
        return
      }

      const s3 = useS3Client()
      const startTime = Date.now()

      try {
        const result = await s3.listBuckets()
        const responseTime = Date.now() - startTime

        if (result.success) {
          this.recordApiSuccess(responseTime)
        } else {
          this.recordApiError(result.error ?? 'Unknown error')
        }
      } catch (error) {
        this.recordApiError(error instanceof Error ? error.message : 'Connection failed')
      }
    },
  },
})
