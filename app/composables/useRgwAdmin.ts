import { SignatureV4 } from '@smithy/signature-v4'
import { HttpRequest } from '@smithy/protocol-http'
import { Sha256 } from '@aws-crypto/sha256-browser'
import type { S3ClientConfig, S3OperationResult } from './useS3Client'
import type { ProxyCredentials } from '~/types/connection'
import { useConnectionStore } from '~/stores/connection'

// =============================================================================
// TYPES
// =============================================================================

export interface RgwBucketInfo {
  bucket: string
  owner: string
  // Additional fields from detailed bucket info
  id?: string
  marker?: string
  maxMarker?: string
  usage?: Record<string, { size: number; numObjects: number }>
  bucketQuota?: {
    enabled: boolean
    maxSize: number
    maxObjects: number
  }
}

export interface RgwBucketListResponse {
  buckets: string[]
}

export interface RgwUserKey {
  user: string
  accessKey: string
  secretKey?: string // Only returned on creation
}

export interface CreateUserOptions {
  uid: string
  displayName: string
  email?: string
  tenant?: string
  maxBuckets?: number // -1 for unlimited
  suspended?: boolean
  systemUser?: boolean
  generateKey?: boolean // Default true
  accessKey?: string // Only if generateKey is false
  secretKey?: string // Only if generateKey is false
  userCaps?: string // Format: "users=read;buckets=write"
  userQuota?: {
    enabled: boolean
    maxSize?: number
    maxObjects?: number
  }
  bucketQuota?: {
    enabled: boolean
    maxSize?: number
    maxObjects?: number
  }
}

export interface CreateUserResult {
  userId: string
  displayName: string
  email?: string
  tenant?: string
  suspended: boolean
  maxBuckets: number
  keys: RgwUserKey[]
  caps: RgwUserCap[]
}

export interface RgwUserCap {
  type: string
  perm: string
}

export interface RgwQuota {
  enabled: boolean
  maxSize: number
  maxObjects: number
}

export interface RgwUserInfo {
  userId: string
  displayName: string
  email?: string
  suspended: boolean
  maxBuckets: number
  stats?: {
    size: number
    sizeActual: number
    numObjects: number
  }
}

export interface RgwUserDetails extends RgwUserInfo {
  tenant?: string
  keys: RgwUserKey[]
  caps: RgwUserCap[]
  userQuota: RgwQuota
  bucketQuota: RgwQuota
  opMask?: string
  defaultPlacement?: string
  placementTags?: string[]
}

export interface RgwUserListResponse {
  keys: string[]
}

export interface RgwUsageEntry {
  user: string
  bucket?: string
  categories: Array<{
    category: string
    bytesReceived: number
    bytesSent: number
    ops: number
    successfulOps: number
  }>
}

export interface RgwUsageResponse {
  entries: RgwUsageEntry[]
  summary: Array<{
    user: string
    categories: Array<{
      category: string
      bytesReceived: number
      bytesSent: number
      ops: number
      successfulOps: number
    }>
    total: {
      bytesReceived: number
      bytesSent: number
      ops: number
      successfulOps: number
    }
  }>
}

export interface ClusterStats {
  totalBuckets: number
  totalObjects: number
  totalSize: number
  bucketsByOwner: Map<string, number>
}

export interface UserStats {
  totalUsers: number
  topUsersBySize: Array<{
    userId: string
    displayName: string
    size: number
    numObjects: number
  }>
}

export interface UsageStats {
  bytesReceived: number
  bytesSent: number
  totalOps: number
  successfulOps: number
}

export interface ZoneInfo {
  id: string
  name: string
  isMultiSite: boolean
  masterZone?: string
  realm?: string
  zonegroup?: string
  syncStatus?: 'syncing' | 'idle' | 'error' | 'unknown'
}

export interface PlacementTarget {
  name: string
  storageClasses: string[]
  pool?: string
}

export interface UsageFilter {
  uid?: string
  bucket?: string
  start?: Date
  end?: Date
  showEntries?: boolean
  showSummary?: boolean
}

// =============================================================================
// STATE
// =============================================================================

let adminConfig: S3ClientConfig | null = null

// Proxy mode state
let proxyMode = false
let activePresetId: string | null = null
let proxyCredentials: ProxyCredentials | null = null

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Converts a Date to RGW Admin API timestamp format (YYYY-MM-DD HH:MM:SS).
 * @param { Date } date - Date to format
 * @return { string } Formatted timestamp string for RGW API queries
 */
function formatRgwTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// =============================================================================
// COMPOSABLE
// =============================================================================

export function useRgwAdmin() {
  /**
   * Configures the RGW Admin API client using the same credentials as S3.
   * Required before calling any admin operations in direct mode.
   * @param { S3ClientConfig } config - Endpoint, credentials, and region settings
   */
  function initializeAdmin(config: S3ClientConfig): void {
    adminConfig = config
  }

  /**
   * Checks if admin client is ready for operations.
   * @return { boolean } True if initializeAdmin() has been called or proxy mode is active
   */
  function isInitialized(): boolean {
    return adminConfig !== null
  }

  /**
   * Clears admin client configuration and proxy state.
   * Call when disconnecting or switching connections.
   */
  function destroyAdmin(): void {
    adminConfig = null
    // Also reset proxy mode
    proxyMode = false
    activePresetId = null
    proxyCredentials = null
  }

  // ===========================================================================
  // PROXY MODE
  // ===========================================================================

  /**
   * Activates server-side proxy mode using admin-configured preset credentials.
   * Admin API requests will route through /api/proxy/admin.
   * @param { string } presetId - The preset ID matching server configuration
   */
  function enableProxyMode(presetId: string): void {
    proxyMode = true
    activePresetId = presetId
    proxyCredentials = null
    adminConfig = null
  }

  /**
   * Activates proxy mode with user-provided credentials sent per-request.
   * @param { ProxyCredentials } credentials - Endpoint and auth details for proxy signing
   */
  function enableProxyModeWithCredentials(credentials: ProxyCredentials): void {
    proxyMode = true
    activePresetId = null
    proxyCredentials = credentials
    adminConfig = null
  }

  /**
   * Switches back to direct Admin API mode.
   */
  function disableProxyMode(): void {
    proxyMode = false
    activePresetId = null
    proxyCredentials = null
  }

  /**
   * Returns whether admin requests are routed through the server proxy.
   * @return { boolean } True if using proxy mode
   */
  function isProxyMode(): boolean {
    return proxyMode
  }

  /**
   * Routes an Admin API request through the server proxy for signing.
   * Used internally when proxy mode is active.
   * @param { string } path - Admin API path (e.g., '/admin/user')
   * @param { string } method - HTTP method (default: 'GET')
   * @param { Record<string, string> } queryParams - URL query parameters
   * @return { Promise<S3OperationResult<T>> } Parsed API response or error
   */
  async function proxyAdminRequest<T>(
    path: string,
    method: string = 'GET',
    queryParams: Record<string, string> = {}
  ): Promise<S3OperationResult<T>> {
    if (!activePresetId && !proxyCredentials) {
      return { success: false, error: 'Proxy mode not enabled' }
    }

    try {
      // Build request body - either with presetId or credentials
      const requestBody: {
        presetId?: string
        credentials?: ProxyCredentials
        path: string
        method: string
        queryParams: Record<string, string>
      } = {
        path,
        method,
        queryParams,
      }

      if (activePresetId) {
        requestBody.presetId = activePresetId
      } else if (proxyCredentials) {
        requestBody.credentials = proxyCredentials
      }

      const response = await $fetch<{ success: boolean; data?: T; error?: string }>('/api/proxy/admin', {
        method: 'POST',
        body: requestBody,
      })

      if (response.success) {
        return { success: true, data: response.data }
      }
      return { success: false, error: response.error || 'Proxy request failed' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Proxy request failed',
      }
    }
  }

  /**
   * Makes a signed request to the RGW Admin API endpoint.
   * Automatically routes through proxy if proxy mode is enabled.
   * @param { string } path - Admin API path (e.g., '/admin/bucket', '/admin/user')
   * @param { string } method - HTTP method (default: 'GET')
   * @param { Record<string, string> } queryParams - URL query parameters for the request
   * @return { Promise<S3OperationResult<T>> } Parsed JSON response or error details
   */
  async function adminRequest<T>(
    path: string,
    method: string = 'GET',
    queryParams: Record<string, string> = {}
  ): Promise<S3OperationResult<T>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      return proxyAdminRequest<T>(path, method, queryParams)
    }

    if (!adminConfig) {
      return {
        success: false,
        error: 'Admin client not initialized',
      }
    }

    try {
      const endpoint = new URL(adminConfig.endpoint)

      // Build query string
      const searchParams = new URLSearchParams({ format: 'json', ...queryParams })

      // Create the HTTP request
      const request = new HttpRequest({
        method,
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port ? parseInt(endpoint.port) : (endpoint.protocol === 'https:' ? 443 : 80),
        path: path,
        query: Object.fromEntries(searchParams),
        headers: {
          host: endpoint.host,
          'content-type': 'application/json',
        },
      })

      // Create signer
      const signer = new SignatureV4({
        credentials: {
          accessKeyId: adminConfig.accessKeyId,
          secretAccessKey: adminConfig.secretAccessKey,
        },
        region: adminConfig.region,
        service: 's3',
        sha256: Sha256,
      })

      // Sign the request
      const signedRequest = await signer.sign(request)

      // Build the full URL
      const url = `${endpoint.protocol}//${endpoint.host}${path}?${searchParams.toString()}`

      // Make the fetch call
      const response = await fetch(url, {
        method: signedRequest.method,
        headers: signedRequest.headers as Record<string, string>,
      })

      // Capture Ceph version from Server header
      const serverHeader = response.headers.get('Server')
      if (serverHeader) {
        try {
          const connectionStore = useConnectionStore()
          connectionStore.setCephVersion(serverHeader)
        } catch {
          // Ignore if store not available (e.g., during SSR)
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `Admin API error: ${response.status}`

        // Try to parse XML error from RGW
        if (errorText.includes('<Code>')) {
          const codeMatch = errorText.match(/<Code>([^<]+)<\/Code>/)
          const messageMatch = errorText.match(/<Message>([^<]+)<\/Message>/)
          if (codeMatch?.[1]) {
            errorMessage = codeMatch[1]
            if (messageMatch?.[1]) {
              errorMessage += `: ${messageMatch[1]}`
            }
          }
        }

        return {
          success: false,
          error: errorMessage,
        }
      }

      const data = await response.json() as T
      return { success: true, data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Admin API request failed',
      }
    }
  }

  /**
   * Lists every bucket in the cluster, not just those owned by current user.
   * Requires 'buckets=read' admin capability.
   * @return { Promise<S3OperationResult<string[]>> } Array of all bucket names in the cluster
   */
  async function listAllBuckets(): Promise<S3OperationResult<string[]>> {
    const result = await adminRequest<string[]>('/admin/bucket')
    return result
  }

  /**
   * Retrieves detailed admin info for a bucket including owner, quota, and usage stats.
   * @param { string } bucketName - Name of the bucket to query
   * @return { Promise<S3OperationResult<RgwBucketInfo>> } Bucket details including owner and storage usage
   */
  async function getBucketInfo(bucketName: string): Promise<S3OperationResult<RgwBucketInfo>> {
    interface RawBucketInfo {
      bucket: string
      owner: string
      id?: string
      marker?: string
      max_marker?: string
      usage?: Record<string, { size: number; size_actual?: number; num_objects: number }>
      bucket_quota?: {
        enabled: boolean
        max_size: number
        max_objects: number
        max_size_kb?: number
      }
    }

    const result = await adminRequest<RawBucketInfo>('/admin/bucket', 'GET', {
      bucket: bucketName,
      stats: 'true',
    })

    if (result.success && result.data) {
      const data = result.data
      // Transform snake_case to camelCase
      const usage: Record<string, { size: number; numObjects: number }> = {}
      if (data.usage) {
        for (const [key, value] of Object.entries(data.usage)) {
          usage[key] = {
            size: value.size || 0,
            numObjects: value.num_objects || 0,
          }
        }
      }

      return {
        success: true,
        data: {
          bucket: data.bucket,
          owner: data.owner,
          id: data.id,
          marker: data.marker,
          maxMarker: data.max_marker,
          usage: Object.keys(usage).length > 0 ? usage : undefined,
          bucketQuota: data.bucket_quota ? {
            enabled: data.bucket_quota.enabled,
            maxSize: data.bucket_quota.max_size,
            maxObjects: data.bucket_quota.max_objects,
          } : undefined,
        },
      }
    }

    return { success: false, error: result.error }
  }

  /**
   * Fetches detailed info for multiple buckets concurrently.
   * @param { string[] } bucketNames - Array of bucket names to query
   * @return { Promise<S3OperationResult<RgwBucketInfo[]>> } Array of bucket details for successful queries
   */
  async function getBucketsInfo(bucketNames: string[]): Promise<S3OperationResult<RgwBucketInfo[]>> {
    try {
      const results = await Promise.all(
        bucketNames.map(name => getBucketInfo(name))
      )

      const buckets: RgwBucketInfo[] = []
      const errors: string[] = []

      for (const result of results) {
        if (result.success && result.data) {
          buckets.push(result.data)
        } else if (result.error) {
          errors.push(result.error)
        }
      }

      return {
        success: errors.length === 0,
        data: buckets,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get bucket info',
      }
    }
  }

  // ===========================================================================
  // CAPABILITY PROBING
  // ===========================================================================

  /**
   * Tests if current credentials have 'buckets' admin capability.
   * @return { Promise<boolean> } True if bucket listing via admin API succeeds
   */
  async function probeBucketCap(): Promise<boolean> {
    const result = await adminRequest<string[]>('/admin/bucket')
    return result.success
  }

  /**
   * Tests if current credentials have 'users' admin capability.
   * Uses metadata endpoint since /admin/user requires a uid parameter.
   * @return { Promise<boolean> } True if user listing via admin API succeeds
   */
  async function probeUserCap(): Promise<boolean> {
    const result = await adminRequest<string[]>('/admin/metadata/user')
    return result.success
  }

  /**
   * Tests if current credentials have 'usage' admin capability.
   * @return { Promise<boolean> } True if usage stats retrieval succeeds
   */
  async function probeUsageCap(): Promise<boolean> {
    const result = await adminRequest<RgwUsageResponse>('/admin/usage', 'GET', {
      'show-summary': 'true',
    })
    return result.success
  }

  /**
   * Tests if current credentials have zone/realm admin capability.
   * Tries both /admin/realm and /admin/zone endpoints.
   * @return { Promise<boolean> } True if zone info retrieval succeeds
   */
  async function probeZoneCap(): Promise<boolean> {
    // Try /admin/realm first (newer API)
    const realmResult = await adminRequest<unknown>('/admin/realm', 'GET', { list: '' })
    if (realmResult.success) return true

    // Fall back to /admin/zone
    const zoneResult = await adminRequest<unknown>('/admin/zone', 'GET', { list: '' })
    return zoneResult.success
  }

  /**
   * Tests if current credentials have metadata admin capability.
   * @return { Promise<boolean> } True if metadata API access succeeds
   */
  async function probeMetadataCap(): Promise<boolean> {
    const result = await adminRequest<string[]>('/admin/metadata')
    return result.success
  }

  /**
   * Detects if connected to Ceph RGW vs other S3 implementations (MinIO, AWS).
   * Distinguishes between "Ceph without admin access" (403) and "not Ceph" (404).
   * @return { Promise<{ isCeph: boolean; hasAdminAccess: boolean }> } Detection results
   */
  async function detectCephRgw(): Promise<{ isCeph: boolean; hasAdminAccess: boolean }> {
    try {
      // Try to access a simple admin endpoint
      // Success → Ceph with admin access
      // 403 → Ceph but no admin access (admin API exists but we lack permissions)
      // 404 → Not Ceph (admin API doesn't exist)
      const result = await adminRequest<unknown>('/admin/metadata')

      if (result.success) {
        return { isCeph: true, hasAdminAccess: true }
      }

      // Check the error message for indicators
      const error = result.error?.toLowerCase() ?? ''

      // AccessDenied or 403 → Ceph but no admin
      if (error.includes('accessdenied') || error.includes('403') || error.includes('forbidden')) {
        return { isCeph: true, hasAdminAccess: false }
      }

      // NoSuchKey, NoSuchBucket, 404 → Not Ceph (admin API doesn't exist)
      if (error.includes('nosuchkey') || error.includes('nosuchbucket') || error.includes('404') || error.includes('not found')) {
        return { isCeph: false, hasAdminAccess: false }
      }

      // Other errors - try to be smart about it
      // If we get a signature error, the endpoint exists (Ceph)
      if (error.includes('signature') || error.includes('accesskey')) {
        return { isCeph: true, hasAdminAccess: false }
      }

      // Default to not Ceph for unknown errors
      return { isCeph: false, hasAdminAccess: false }
    } catch {
      // Network errors or other issues - assume not Ceph
      return { isCeph: false, hasAdminAccess: false }
    }
  }

  // ===========================================================================
  // USER MANAGEMENT
  // ===========================================================================

  /**
   * Lists all user IDs in the cluster. Requires 'users=read' admin capability.
   * @return { Promise<S3OperationResult<string[]>> } Array of user IDs
   */
  async function listUsers(): Promise<S3OperationResult<string[]>> {
    return adminRequest<string[]>('/admin/metadata/user')
  }

  /**
   * Retrieves basic user info including display name, email, and storage stats.
   * @param { string } uid - User ID to query
   * @return { Promise<S3OperationResult<RgwUserInfo>> } User profile and storage usage
   */
  async function getUserInfo(uid: string): Promise<S3OperationResult<RgwUserInfo>> {
    interface RawUserInfo {
      user_id: string
      display_name: string
      email?: string
      suspended: number
      max_buckets: number
      stats?: {
        size: number
        size_actual: number
        num_objects: number
      }
    }

    const result = await adminRequest<RawUserInfo>('/admin/user', 'GET', { uid })

    if (result.success && result.data) {
      // Transform snake_case to camelCase
      const data = result.data
      return {
        success: true,
        data: {
          userId: data.user_id,
          displayName: data.display_name,
          email: data.email,
          suspended: data.suspended === 1,
          maxBuckets: data.max_buckets,
          stats: data.stats ? {
            size: data.stats.size,
            sizeActual: data.stats.size_actual,
            numObjects: data.stats.num_objects,
          } : undefined,
        },
      }
    }

    return { success: false, error: result.error }
  }

  /**
   * Fetches user info for multiple users concurrently.
   * @param { string[] } uids - Array of user IDs to query
   * @return { Promise<S3OperationResult<RgwUserInfo[]>> } Array of user profiles
   */
  async function getUsersInfo(uids: string[]): Promise<S3OperationResult<RgwUserInfo[]>> {
    try {
      const results = await Promise.all(uids.map(uid => getUserInfo(uid)))

      const users: RgwUserInfo[] = []
      for (const result of results) {
        if (result.success && result.data) {
          users.push(result.data)
        }
      }

      return { success: true, data: users }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user info',
      }
    }
  }

  /**
   * Retrieves complete user details including access keys, capabilities, and quotas.
   * @param { string } uid - User ID to query
   * @return { Promise<S3OperationResult<RgwUserDetails>> } Full user profile with keys and permissions
   */
  async function getUserDetails(uid: string): Promise<S3OperationResult<RgwUserDetails>> {
    interface RawUserDetails {
      user_id: string
      display_name: string
      email?: string
      tenant?: string
      suspended: number
      max_buckets: number
      op_mask?: string
      default_placement?: string
      placement_tags?: string[]
      keys?: Array<{
        user: string
        access_key: string
        secret_key?: string
      }>
      caps?: Array<{
        type: string
        perm: string
      }>
      user_quota?: {
        enabled: boolean
        max_size: number
        max_objects: number
        max_size_kb?: number
      }
      bucket_quota?: {
        enabled: boolean
        max_size: number
        max_objects: number
        max_size_kb?: number
      }
      stats?: {
        size: number
        size_actual: number
        num_objects: number
      }
    }

    const result = await adminRequest<RawUserDetails>('/admin/user', 'GET', { uid, stats: 'true' })

    if (result.success && result.data) {
      const data = result.data
      return {
        success: true,
        data: {
          userId: data.user_id,
          displayName: data.display_name,
          email: data.email,
          tenant: data.tenant,
          suspended: data.suspended === 1,
          maxBuckets: data.max_buckets,
          opMask: data.op_mask,
          defaultPlacement: data.default_placement,
          placementTags: data.placement_tags,
          keys: (data.keys ?? []).map(k => ({
            user: k.user,
            accessKey: k.access_key,
          })),
          caps: data.caps ?? [],
          userQuota: {
            enabled: data.user_quota?.enabled ?? false,
            maxSize: data.user_quota?.max_size ?? -1,
            maxObjects: data.user_quota?.max_objects ?? -1,
          },
          bucketQuota: {
            enabled: data.bucket_quota?.enabled ?? false,
            maxSize: data.bucket_quota?.max_size ?? -1,
            maxObjects: data.bucket_quota?.max_objects ?? -1,
          },
          stats: data.stats ? {
            size: data.stats.size,
            sizeActual: data.stats.size_actual,
            numObjects: data.stats.num_objects,
          } : undefined,
        },
      }
    }

    return { success: false, error: result.error }
  }

  /**
   * Suspends a user, preventing all S3 operations with their credentials.
   * @param { string } uid - User ID to suspend
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function suspendUser(uid: string): Promise<S3OperationResult<void>> {
    const result = await adminRequest<unknown>('/admin/user', 'POST', {
      uid,
      suspended: 'true',
    })

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  /**
   * Re-enables a suspended user, restoring their S3 access.
   * @param { string } uid - User ID to enable
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function enableUser(uid: string): Promise<S3OperationResult<void>> {
    const result = await adminRequest<unknown>('/admin/user', 'POST', {
      uid,
      suspended: 'false',
    })

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  /**
   * Creates a new RGW user with optional quotas and capabilities.
   * Returns the generated access keys if generateKey is true (default).
   * @param { CreateUserOptions } options - User settings including uid, displayName, quotas
   * @return { Promise<S3OperationResult<CreateUserResult>> } Created user with access keys
   */
  async function createUser(options: CreateUserOptions): Promise<S3OperationResult<CreateUserResult>> {
    interface RawCreateUserResponse {
      user_id: string
      display_name: string
      email?: string
      tenant?: string
      suspended: number
      max_buckets: number
      keys?: Array<{
        user: string
        access_key: string
        secret_key?: string
      }>
      caps?: Array<{
        type: string
        perm: string
      }>
    }

    // Build query parameters
    const params: Record<string, string> = {
      uid: options.tenant ? `${options.tenant}$${options.uid}` : options.uid,
      'display-name': options.displayName,
    }

    if (options.email) {
      params['email'] = options.email
    }

    if (options.maxBuckets !== undefined) {
      params['max-buckets'] = options.maxBuckets.toString()
    }

    if (options.suspended) {
      params['suspended'] = 'true'
    }

    if (options.systemUser) {
      params['system'] = 'true'
    }

    // Key generation
    if (options.generateKey === false) {
      params['generate-key'] = 'false'
      if (options.accessKey) {
        params['access-key'] = options.accessKey
      }
      if (options.secretKey) {
        params['secret-key'] = options.secretKey
      }
    }

    // Capabilities
    if (options.userCaps) {
      params['user-caps'] = options.userCaps
    }

    const result = await adminRequest<RawCreateUserResponse>('/admin/user', 'PUT', params)

    if (result.success && result.data) {
      const data = result.data

      const createResult: CreateUserResult = {
        userId: data.user_id,
        displayName: data.display_name,
        email: data.email,
        tenant: data.tenant,
        suspended: data.suspended === 1,
        maxBuckets: data.max_buckets,
        keys: (data.keys ?? []).map(k => ({
          user: k.user,
          accessKey: k.access_key,
          secretKey: k.secret_key,
        })),
        caps: data.caps ?? [],
      }

      // Set quotas if specified (requires separate API calls)
      if (options.userQuota?.enabled) {
        await setUserQuota(options.uid, options.tenant, {
          enabled: true,
          maxSize: options.userQuota.maxSize,
          maxObjects: options.userQuota.maxObjects,
        })
      }

      if (options.bucketQuota?.enabled) {
        await setUserBucketQuota(options.uid, options.tenant, {
          enabled: true,
          maxSize: options.bucketQuota.maxSize,
          maxObjects: options.bucketQuota.maxObjects,
        })
      }

      return { success: true, data: createResult }
    }

    return { success: false, error: result.error }
  }

  /**
   * Configures overall storage quota for a user (max total size/objects across all buckets).
   * @param { string } uid - User ID to configure
   * @param { string | undefined } tenant - Tenant prefix if multi-tenant
   * @param { object } quota - Quota settings (enabled, maxSize in bytes, maxObjects)
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function setUserQuota(
    uid: string,
    tenant: string | undefined,
    quota: { enabled: boolean; maxSize?: number; maxObjects?: number }
  ): Promise<S3OperationResult<void>> {
    const fullUid = tenant ? `${tenant}$${uid}` : uid
    const params: Record<string, string> = {
      uid: fullUid,
      'quota-type': 'user',
      enabled: quota.enabled ? 'true' : 'false',
    }

    if (quota.enabled) {
      if (quota.maxSize !== undefined && quota.maxSize >= 0) {
        params['max-size'] = quota.maxSize.toString()
      }
      if (quota.maxObjects !== undefined && quota.maxObjects >= 0) {
        params['max-objects'] = quota.maxObjects.toString()
      }
    }

    const result = await adminRequest<unknown>('/admin/user', 'PUT', {
      ...params,
      quota: '',
    })

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  /**
   * Configures default per-bucket quota limits for a user's new buckets.
   * @param { string } uid - User ID to configure
   * @param { string | undefined } tenant - Tenant prefix if multi-tenant
   * @param { object } quota - Default bucket quota (enabled, maxSize, maxObjects)
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function setUserBucketQuota(
    uid: string,
    tenant: string | undefined,
    quota: { enabled: boolean; maxSize?: number; maxObjects?: number }
  ): Promise<S3OperationResult<void>> {
    const fullUid = tenant ? `${tenant}$${uid}` : uid
    const params: Record<string, string> = {
      uid: fullUid,
      'quota-type': 'bucket',
      enabled: quota.enabled ? 'true' : 'false',
    }

    if (quota.enabled) {
      if (quota.maxSize !== undefined && quota.maxSize >= 0) {
        params['max-size'] = quota.maxSize.toString()
      }
      if (quota.maxObjects !== undefined && quota.maxObjects >= 0) {
        params['max-objects'] = quota.maxObjects.toString()
      }
    }

    const result = await adminRequest<unknown>('/admin/user', 'PUT', {
      ...params,
      quota: '',
    })

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  /**
   * Retrieves all buckets owned by a specific user with detailed info.
   * @param { string } uid - User ID to query buckets for
   * @return { Promise<S3OperationResult<RgwBucketInfo[]>> } Array of bucket details owned by user
   */
  async function getUserBuckets(uid: string): Promise<S3OperationResult<RgwBucketInfo[]>> {
    // List all buckets and filter by owner
    const listResult = await listAllBuckets()
    if (!listResult.success || !listResult.data) {
      return { success: false, error: listResult.error }
    }

    const infoResult = await getBucketsInfo(listResult.data)
    if (!infoResult.success || !infoResult.data) {
      return { success: false, error: infoResult.error }
    }

    const userBuckets = infoResult.data.filter(b => b.owner === uid)
    return { success: true, data: userBuckets }
  }

  // ===========================================================================
  // USAGE STATS
  // ===========================================================================

  /**
   * Retrieves usage statistics (bandwidth, operations) with optional filtering.
   * @param { UsageFilter } filter - Optional filters: uid, bucket, start/end dates
   * @return { Promise<S3OperationResult<RgwUsageResponse>> } Usage entries and summary by user
   */
  async function getUsage(filter?: UsageFilter): Promise<S3OperationResult<RgwUsageResponse>> {
    interface RawUsageResponse {
      entries: Array<{
        user: string
        bucket?: string
        categories: Array<{
          category: string
          bytes_received: number
          bytes_sent: number
          ops: number
          successful_ops: number
        }>
      }>
      summary: Array<{
        user: string
        categories: Array<{
          category: string
          bytes_received: number
          bytes_sent: number
          ops: number
          successful_ops: number
        }>
        total: {
          bytes_received: number
          bytes_sent: number
          ops: number
          successful_ops: number
        }
      }>
    }

    // Build query parameters
    const params: Record<string, string> = {
      'show-summary': filter?.showSummary !== false ? 'true' : 'false',
      'show-entries': filter?.showEntries !== false ? 'true' : 'false',
    }

    if (filter?.uid) {
      params['uid'] = filter.uid
    }
    if (filter?.bucket) {
      params['bucket'] = filter.bucket
    }
    if (filter?.start) {
      // RGW expects format: YYYY-MM-DD HH:MM:SS
      params['start'] = formatRgwTimestamp(filter.start)
    }
    if (filter?.end) {
      params['end'] = formatRgwTimestamp(filter.end)
    }

    const result = await adminRequest<RawUsageResponse>('/admin/usage', 'GET', params)

    if (result.success && result.data) {
      // Transform snake_case to camelCase
      const data = result.data
      return {
        success: true,
        data: {
          entries: data.entries?.map(e => ({
            user: e.user,
            bucket: e.bucket,
            categories: e.categories?.map(c => ({
              category: c.category,
              bytesReceived: c.bytes_received,
              bytesSent: c.bytes_sent,
              ops: c.ops,
              successfulOps: c.successful_ops,
            })) ?? [],
          })) ?? [],
          summary: data.summary?.map(s => ({
            user: s.user,
            categories: s.categories?.map(c => ({
              category: c.category,
              bytesReceived: c.bytes_received,
              bytesSent: c.bytes_sent,
              ops: c.ops,
              successfulOps: c.successful_ops,
            })) ?? [],
            total: {
              bytesReceived: s.total?.bytes_received ?? 0,
              bytesSent: s.total?.bytes_sent ?? 0,
              ops: s.total?.ops ?? 0,
              successfulOps: s.total?.successful_ops ?? 0,
            },
          })) ?? [],
        },
      }
    }

    return { success: false, error: result.error }
  }

  // ===========================================================================
  // ZONE INFO
  // ===========================================================================

  /**
   * Retrieves RGW zone/realm information for multi-site awareness.
   * Falls back to defaults since /admin/zone isn't available in all RGW versions.
   * @return { Promise<S3OperationResult<ZoneInfo>> } Zone name, realm, and multi-site status
   */
  async function getZoneInfo(): Promise<S3OperationResult<ZoneInfo>> {
    interface RealmListResponse {
      default_info?: string
      realms?: string[]
    }

    const realmResult = await adminRequest<RealmListResponse>('/admin/realm', 'GET', { list: '' })

    if (realmResult.success && realmResult.data) {
      const hasMultipleRealms = (realmResult.data.realms?.length ?? 0) > 1
      const realmName = realmResult.data.default_info || realmResult.data.realms?.[0]

      return {
        success: true,
        data: {
          id: 'default',
          name: 'default',
          isMultiSite: hasMultipleRealms,
          realm: realmName,
        },
      }
    }

    // Return minimal info if realm call fails
    return {
      success: true,
      data: {
        id: 'default',
        name: 'default',
        isMultiSite: false,
      },
    }
  }

  /**
   * Retrieves available placement targets for bucket creation (storage pools/zones).
   * Used to populate placement selector in bucket creation UI.
   * @return { Promise<S3OperationResult<PlacementTarget[]>> } Available placement targets with storage classes
   */
  async function getPlacementTargets(): Promise<S3OperationResult<PlacementTarget[]>> {
    if (!isInitialized()) {
      return { success: false, error: 'Admin client not initialized' }
    }

    // Get zone info which includes the zone name and realm (used as pool identifier)
    const zoneResult = await getZoneInfo()

    const zoneName = zoneResult.data?.name || 'default'
    const poolName = zoneResult.data?.realm || zoneName

    return {
      success: true,
      data: [{
        name: zoneName,
        storageClasses: ['STANDARD'],
        pool: poolName,
      }],
    }
  }

  // ===========================================================================
  // AGGREGATE STATS
  // ===========================================================================

  /**
   * Aggregates cluster-wide storage statistics from all buckets.
   * Queries up to 100 buckets to avoid overloading the API.
   * @return { Promise<S3OperationResult<ClusterStats>> } Total buckets, objects, size, and per-owner counts
   */
  async function getClusterStats(): Promise<S3OperationResult<ClusterStats>> {
    // First get list of all buckets
    const bucketsResult = await listAllBuckets()
    if (!bucketsResult.success || !bucketsResult.data) {
      return { success: false, error: bucketsResult.error }
    }

    const bucketNames = bucketsResult.data

    // Get detailed info for all buckets (limit to avoid overwhelming)
    const limit = Math.min(bucketNames.length, 100)
    const bucketInfos = await getBucketsInfo(bucketNames.slice(0, limit))

    if (!bucketInfos.success || !bucketInfos.data) {
      return { success: false, error: bucketInfos.error }
    }

    // Calculate totals
    let totalObjects = 0
    let totalSize = 0
    const bucketsByOwner = new Map<string, number>()

    for (const bucket of bucketInfos.data) {
      if (bucket.usage) {
        for (const category of Object.values(bucket.usage)) {
          totalObjects += category.numObjects || 0
          totalSize += category.size || 0
        }
      }

      const ownerCount = bucketsByOwner.get(bucket.owner) || 0
      bucketsByOwner.set(bucket.owner, ownerCount + 1)
    }

    return {
      success: true,
      data: {
        totalBuckets: bucketNames.length,
        totalObjects,
        totalSize,
        bucketsByOwner,
      },
    }
  }

  /**
   * Calculates total bandwidth and operation counts across all users.
   * @return { Promise<S3OperationResult<UsageStats>> } Aggregate bytes sent/received and operation counts
   */
  async function getAggregatedUsage(): Promise<S3OperationResult<UsageStats>> {
    const result = await getUsage()

    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    let bytesReceived = 0
    let bytesSent = 0
    let totalOps = 0
    let successfulOps = 0

    for (const summary of result.data.summary) {
      bytesReceived += summary.total.bytesReceived
      bytesSent += summary.total.bytesSent
      totalOps += summary.total.ops
      successfulOps += summary.total.successfulOps
    }

    return {
      success: true,
      data: {
        bytesReceived,
        bytesSent,
        totalOps,
        successfulOps,
      },
    }
  }

  /**
   * Retrieves user statistics with top storage consumers ranked by size.
   * @param { number } limit - Number of top users to return (default: 5)
   * @return { Promise<S3OperationResult<UserStats>> } Total user count and top users by storage usage
   */
  async function getUserStats(limit: number = 5): Promise<S3OperationResult<UserStats>> {
    // Get list of users
    const usersResult = await listUsers()
    if (!usersResult.success || !usersResult.data) {
      return { success: false, error: usersResult.error }
    }

    const userIds = usersResult.data
    const totalUsers = userIds.length

    // Get info for all users (or a reasonable limit)
    const fetchLimit = Math.min(userIds.length, 50)
    const usersInfo = await getUsersInfo(userIds.slice(0, fetchLimit))

    if (!usersInfo.success || !usersInfo.data) {
      return { success: false, error: usersInfo.error }
    }

    // Sort by size and take top N
    const topUsersBySize = usersInfo.data
      .filter(u => u.stats)
      .sort((a, b) => (b.stats?.size ?? 0) - (a.stats?.size ?? 0))
      .slice(0, limit)
      .map(u => ({
        userId: u.userId,
        displayName: u.displayName,
        size: u.stats?.size ?? 0,
        numObjects: u.stats?.numObjects ?? 0,
      }))

    return {
      success: true,
      data: {
        totalUsers,
        topUsersBySize,
      },
    }
  }

  // ===========================================================================
  // BUCKET QUOTA MANAGEMENT
  // ===========================================================================

  /**
   * Retrieves quota limits for a specific bucket.
   * @param { string } bucketName - Bucket name to query
   * @return { Promise<S3OperationResult<RgwQuota>> } Bucket quota settings (enabled, maxSize, maxObjects)
   */
  async function getBucketQuota(bucketName: string): Promise<S3OperationResult<RgwQuota>> {
    const result = await getBucketInfo(bucketName)

    if (result.success && result.data) {
      return {
        success: true,
        data: {
          enabled: result.data.bucketQuota?.enabled ?? false,
          maxSize: result.data.bucketQuota?.maxSize ?? -1,
          maxObjects: result.data.bucketQuota?.maxObjects ?? -1,
        },
      }
    }

    return { success: false, error: result.error }
  }

  /**
   * Configures storage limits for a specific bucket.
   * @param { string } bucketName - Bucket name to configure
   * @param { string } uid - Bucket owner user ID
   * @param { object } quota - Quota settings (enabled, maxSize in bytes, maxObjects)
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function setBucketQuota(
    bucketName: string,
    uid: string,
    quota: { enabled: boolean; maxSize?: number; maxObjects?: number }
  ): Promise<S3OperationResult<void>> {
    const params: Record<string, string> = {
      bucket: bucketName,
      uid: uid,
      'quota-type': 'bucket',
    }

    if (quota.enabled) {
      params['enabled'] = 'true'
      if (quota.maxSize !== undefined && quota.maxSize >= 0) {
        params['max-size'] = quota.maxSize.toString()
      }
      if (quota.maxObjects !== undefined && quota.maxObjects >= 0) {
        params['max-objects'] = quota.maxObjects.toString()
      }
    } else {
      params['enabled'] = 'false'
    }

    const result = await adminRequest<unknown>('/admin/bucket', 'PUT', params)

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  /**
   * Transfers bucket ownership to a different user.
   * @param { string } bucketName - Bucket name to transfer
   * @param { string } newOwnerUid - User ID of new owner
   * @return { Promise<S3OperationResult<void>> } Success/failure status
   */
  async function linkBucket(bucketName: string, newOwnerUid: string): Promise<S3OperationResult<void>> {
    const result = await adminRequest<unknown>('/admin/bucket', 'PUT', {
      bucket: bucketName,
      uid: newOwnerUid,
    })

    if (result.success) {
      return { success: true, data: undefined }
    }
    return { success: false, error: result.error }
  }

  return {
    initializeAdmin,
    isInitialized,
    destroyAdmin,
    // Proxy mode
    enableProxyMode,
    enableProxyModeWithCredentials,
    disableProxyMode,
    isProxyMode,
    // Core
    adminRequest,
    // Bucket operations
    listAllBuckets,
    getBucketInfo,
    getBucketsInfo,
    getBucketQuota,
    setBucketQuota,
    linkBucket,
    // Capability probing
    probeBucketCap,
    probeUserCap,
    probeUsageCap,
    probeZoneCap,
    probeMetadataCap,
    // Backend detection
    detectCephRgw,
    // User management
    listUsers,
    getUserInfo,
    getUsersInfo,
    getUserDetails,
    suspendUser,
    enableUser,
    createUser,
    setUserQuota,
    setUserBucketQuota,
    getUserBuckets,
    // Usage stats
    getUsage,
    // Zone info
    getZoneInfo,
    getPlacementTargets,
    // Aggregated stats
    getClusterStats,
    getAggregatedUsage,
    getUserStats,
  }
}
