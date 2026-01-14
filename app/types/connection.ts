// =============================================================================
// CONNECTION SOURCE & MODE TYPES
// =============================================================================

/**
 * Source of a connection configuration
 * - 'local': Saved connection from localStorage
 * - 'preset': Admin-configured preset from environment
 * - 'manual': User entered manually (not saved)
 */
export type ConnectionSource = 'local' | 'preset' | 'manual'

/**
 * Mode of connection - how S3 requests are routed
 * - 'direct': Browser connects directly to RGW endpoint
 * - 'proxy': Requests routed through server (credentials stay on server)
 */
export type ConnectionMode = 'direct' | 'proxy'

/**
 * Detected backend type - determines which features are available
 * - 'ceph-rgw-admin': Ceph RGW with admin API access (full features)
 * - 'ceph-rgw': Ceph RGW but no admin capabilities (limited features)
 * - 's3-compatible': MinIO, AWS S3, or other S3-compatible storage (basic S3 only)
 * - 'unknown': Not yet detected
 */
export type BackendType = 'ceph-rgw-admin' | 'ceph-rgw' | 's3-compatible' | 'unknown'

// =============================================================================
// PRESET TYPES (from environment variables)
// =============================================================================

/**
 * Connection preset as exposed to the frontend.
 * Credentials are only included for direct mode presets.
 */
export interface ConnectionPreset {
  /** Unique identifier, e.g., "rgw_1" */
  id: string
  /** Display name for the connection */
  name: string
  /** RGW endpoint URL (hidden in proxy mode UI) */
  endpoint: string
  /** AWS region for signing (default: us-east-1) */
  region: string
  /** Use path-style URLs (required for most Ceph RGW setups) */
  pathStyle: boolean
  /** Connection mode - 'direct' or 'proxy' */
  mode: ConnectionMode
  /** Whether admin provided credentials (affects UI) */
  hasCredentials: boolean
  /** Access key (only present if mode='direct' AND credentials provided) */
  accessKey?: string
  /** Secret key (only present if mode='direct' AND credentials provided) */
  secretKey?: string
}

/**
 * Raw preset from server configuration (internal, never fully sent to client).
 * Used for server-side operations and parsing environment variables.
 */
export interface RawConnectionPreset {
  /** Unique identifier, e.g., "rgw_1" */
  id: string
  /** Display name for the connection */
  name: string
  /** RGW endpoint URL */
  endpoint: string
  /** Access key (optional - user may need to provide) */
  accessKey?: string
  /** Secret key (optional - user may need to provide) */
  secretKey?: string
  /** AWS region for signing */
  region: string
  /** Use path-style URLs */
  pathStyle: boolean
  /** Whether to use proxy mode (credentials stay on server) */
  proxy: boolean
}

// =============================================================================
// SAVED CONNECTION TYPES (localStorage)
// =============================================================================

/**
 * A saved connection stored in localStorage.
 * These are connections the user has manually saved.
 */
export interface SavedConnection {
  /** UUID for the saved connection */
  id: string
  /** User-provided name or auto-generated from endpoint */
  name: string
  /** RGW endpoint URL */
  endpoint: string
  /** Access key */
  accessKey: string
  /** Secret key */
  secretKey: string
  /** AWS region for signing */
  region: string
  /** Use path-style URLs */
  pathStyle: boolean
  /** Whether to route requests through server proxy */
  useProxy?: boolean
  /** ISO date string when connection was saved */
  createdAt: string
  /** ISO date string of last successful connection */
  lastConnectedAt: string | null
  /** Detected backend type (cached from last connection) */
  backendType?: BackendType
}

/**
 * Structure for localStorage saved connections storage.
 */
export interface SavedConnectionsStorage {
  /** Array of saved connections */
  connections: SavedConnection[]
  /** ID of last used connection (saved or preset) */
  lastConnectionId: string | null
  /** Source type of last connection */
  lastConnectionSource: ConnectionSource | null
}

// =============================================================================
// PROXY REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Credentials for proxy requests (used for saved connections with useProxy)
 */
export interface ProxyCredentials {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
  pathStyle: boolean
}

/**
 * S3 proxy request body sent to /api/proxy/s3
 */
export interface S3ProxyRequest {
  /** Preset ID to use for credentials (for preset connections) */
  presetId?: string
  /** Direct credentials (for saved connections with useProxy) */
  credentials?: ProxyCredentials
  /** S3 operation to perform (e.g., 'ListBuckets', 'ListObjectsV2') */
  operation: string
  /** Operation-specific parameters */
  params: Record<string, unknown>
}

/**
 * Admin API proxy request body sent to /api/proxy/admin
 */
export interface AdminProxyRequest {
  /** Preset ID to use for credentials (for preset connections) */
  presetId?: string
  /** Direct credentials (for saved connections with useProxy) */
  credentials?: ProxyCredentials
  /** Admin API path (e.g., '/admin/bucket') */
  path: string
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Query parameters */
  queryParams?: Record<string, string>
  /** Request body for POST/PUT */
  body?: unknown
}

/**
 * Generic proxy response wrapper
 */
export interface ProxyResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean
  /** Response data on success */
  data?: T
  /** Error message on failure */
  error?: string
  /** HTTP status code from RGW */
  statusCode?: number
}

// =============================================================================
// ACTIVE CONNECTION STATE TYPES
// =============================================================================

/**
 * Represents the currently active connection configuration.
 * Used to track how the current connection was established.
 */
export interface ActiveConnectionInfo {
  /** How the connection was established */
  source: ConnectionSource
  /** How requests are routed */
  mode: ConnectionMode
  /** Preset ID if using a preset */
  presetId?: string
  /** Saved connection ID if using a saved connection */
  savedConnectionId?: string
}
