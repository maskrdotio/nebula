import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketVersioningCommand,
  PutBucketVersioningCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  DeleteBucketLifecycleCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  GetBucketAclCommand,
  PutBucketAclCommand,
  GetBucketEncryptionCommand,
  PutBucketEncryptionCommand,
  DeleteBucketEncryptionCommand,
  GetBucketTaggingCommand,
  PutBucketTaggingCommand,
  DeleteBucketTaggingCommand,
  GetObjectLockConfigurationCommand,
  PutObjectLockConfigurationCommand,
  type Bucket,
  type _Object,
  type CommonPrefix,
  type BucketLocationConstraint,
  type CreateBucketCommandInput,
  type LifecycleRule,
  type Grant,
  type Owner,
  type Tag,
  type ObjectLockConfiguration,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ProxyCredentials } from '~/types/connection'

// =============================================================================
// TYPES
// =============================================================================

export interface S3ClientConfig {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  forcePathStyle: boolean
}

export interface S3Bucket {
  name: string
  creationDate: Date | undefined
}

export interface S3Object {
  key: string
  size: number
  lastModified: Date | undefined
  etag: string | undefined
  storageClass: string | undefined
  isFolder: boolean
}

export interface ListObjectsResult {
  objects: S3Object[]
  prefixes: string[]
  isTruncated: boolean
  continuationToken: string | undefined
  nextContinuationToken: string | undefined
}

export interface S3OperationResult<T> {
  success: boolean
  data?: T
  error?: string
}

// Versioning types
export type VersioningStatus = 'Enabled' | 'Suspended' | 'Disabled'

export interface BucketVersioning {
  status: VersioningStatus
  mfaDelete?: boolean
}

// Lifecycle types
export interface LifecycleRuleInfo {
  id: string
  status: 'Enabled' | 'Disabled'
  prefix?: string
  expirationDays?: number
  expirationDate?: Date
  noncurrentVersionExpirationDays?: number
  abortIncompleteMultipartUploadDays?: number
  transitions?: Array<{
    days?: number
    date?: Date
    storageClass: string
  }>
}

// ACL types
export interface AclGrant {
  grantee: {
    type: 'CanonicalUser' | 'AmazonCustomerByEmail' | 'Group'
    id?: string
    displayName?: string
    emailAddress?: string
    uri?: string
  }
  permission: 'FULL_CONTROL' | 'WRITE' | 'WRITE_ACP' | 'READ' | 'READ_ACP'
}

export interface BucketAcl {
  owner: {
    id: string
    displayName?: string
  }
  grants: AclGrant[]
}

// Encryption types
export interface BucketEncryption {
  sseAlgorithm: 'AES256' | 'aws:kms'
  kmsMasterKeyId?: string
  bucketKeyEnabled?: boolean
}

// Tagging types
export interface BucketTag {
  key: string
  value: string
}

// Object Lock types
export interface ObjectLockConfig {
  enabled: boolean
  mode?: 'GOVERNANCE' | 'COMPLIANCE'
  days?: number
  years?: number
}

// =============================================================================
// STATE
// =============================================================================

let s3Client: S3Client | null = null
let currentConfig: S3ClientConfig | null = null

// Proxy mode state
let proxyMode = false
let activePresetId: string | null = null
let proxyCredentials: ProxyCredentials | null = null

// Backend type tracking - affects how certain operations behave
// 'ceph-rgw' and 'ceph-rgw-admin' don't care about region
// 's3-compatible' requires correct region for signing
let backendType: 'unknown' | 'ceph-rgw' | 'ceph-rgw-admin' | 's3-compatible' = 'unknown'

// =============================================================================
// COMPOSABLE
// =============================================================================

export function useS3Client() {
  /**
   * Creates a new S3 client connection or replaces an existing one.
   * Must be called before any S3 operations can be performed in direct mode.
   * @param { S3ClientConfig } config - Endpoint, credentials, and region settings
   */
  function initializeClient(config: S3ClientConfig): void {
    currentConfig = config

    s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  /**
   * Returns the active S3 client for direct API calls.
   * @throws { Error } When called before initializeClient()
   * @return { S3Client } The AWS SDK S3 client instance
   */
  function getClient(): S3Client {
    if (!s3Client) {
      throw new Error('S3 client not initialized. Call initializeClient first.')
    }
    return s3Client
  }

  /**
   * Checks if direct S3 client is ready for operations.
   * Use this to conditionally show UI or prevent operations before connection.
   * @return { boolean } True if initializeClient() has been called
   */
  function isInitialized(): boolean {
    return s3Client !== null
  }

  /**
   * Disconnects from S3 and clears all connection state.
   * Call this when switching connections or logging out.
   */
  function destroyClient(): void {
    if (s3Client) {
      s3Client.destroy()
      s3Client = null
      currentConfig = null
    }
    // Also reset proxy mode and backend type
    proxyMode = false
    activePresetId = null
    proxyCredentials = null
    backendType = 'unknown'
  }

  /**
   * Sets the detected storage backend type. Affects bucket creation behavior -
   * Ceph RGW ignores region constraints while S3-compatible backends require them.
   * @param { 'unknown' | 'ceph-rgw' | 'ceph-rgw-admin' | 's3-compatible' } type - Detected backend
   */
  function setBackendType(type: 'unknown' | 'ceph-rgw' | 'ceph-rgw-admin' | 's3-compatible'): void {
    backendType = type
  }

  /**
   * Returns the detected storage backend type for feature detection.
   * @return { string } Backend identifier: 'ceph-rgw-admin', 'ceph-rgw', 's3-compatible', or 'unknown'
   */
  function getBackendType(): string {
    return backendType
  }

  // ===========================================================================
  // PROXY MODE
  // ===========================================================================

  /**
   * Activates server-side proxy mode using admin-configured preset credentials.
   * All S3 requests will be routed through /api/proxy/s3 instead of direct calls.
   * @param { string } presetId - The preset ID matching server-side configuration
   */
  function enableProxyMode(presetId: string): void {
    proxyMode = true
    activePresetId = presetId
    proxyCredentials = null
    // Don't initialize direct S3 client in proxy mode
    s3Client = null
    currentConfig = null
  }

  /**
   * Activates server-side proxy mode with user-provided credentials.
   * Credentials are sent to the server per-request rather than stored in the browser.
   * @param { ProxyCredentials } credentials - Endpoint and auth details for proxy signing
   */
  function enableProxyModeWithCredentials(credentials: ProxyCredentials): void {
    proxyMode = true
    activePresetId = null
    proxyCredentials = credentials
    // Don't initialize direct S3 client in proxy mode
    s3Client = null
    currentConfig = null
  }

  /**
   * Switches back to direct S3 API mode, clearing proxy configuration.
   */
  function disableProxyMode(): void {
    proxyMode = false
    activePresetId = null
    proxyCredentials = null
  }

  /**
   * Returns whether requests are routed through the server proxy.
   * @return { boolean } True if using proxy mode, false for direct S3 calls
   */
  function isProxyMode(): boolean {
    return proxyMode
  }

  /**
   * Returns the current preset ID when using preset-based proxy mode.
   * @return { string | null } Preset ID or null if using direct mode or credential-based proxy
   */
  function getActivePresetId(): string | null {
    return activePresetId
  }

  /**
   * Sends an S3 operation through the server proxy for signing and forwarding.
   * Used internally by other methods when proxy mode is active.
   * @param { string } operation - AWS S3 operation name (e.g., 'ListBuckets', 'PutObject')
   * @param { Record<string, unknown> } params - Operation parameters matching AWS SDK input
   * @return { Promise<S3OperationResult<T>> } Success/error result with typed response data
   */
  async function proxyS3Request<T>(
    operation: string,
    params: Record<string, unknown>
  ): Promise<S3OperationResult<T>> {
    if (!activePresetId && !proxyCredentials) {
      return { success: false, error: 'Proxy mode not enabled' }
    }

    try {
      // Build request body - either with presetId or credentials
      const requestBody: {
        presetId?: string
        credentials?: ProxyCredentials
        operation: string
        params: Record<string, unknown>
      } = {
        operation,
        params,
      }

      if (activePresetId) {
        requestBody.presetId = activePresetId
      } else if (proxyCredentials) {
        requestBody.credentials = proxyCredentials
      }

      const response = await $fetch<{ success: boolean; data?: T; error?: string }>('/api/proxy/s3', {
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
   * Validates S3 connectivity and credentials by attempting to list buckets.
   * Use this to verify connection settings before saving or proceeding.
   * @return { Promise<S3OperationResult<boolean>> } Success if credentials are valid and endpoint reachable
   */
  async function testConnection(): Promise<S3OperationResult<boolean>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ buckets: unknown[] }>('ListBuckets', {})
      return { success: result.success, data: result.success, error: result.error }
    }

    try {
      const client = getClient()
      await client.send(new ListBucketsCommand({}))
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Fetches all buckets the current credentials have access to.
   * @return { Promise<S3OperationResult<S3Bucket[]>> } Array of buckets with name and creation date
   */
  async function listBuckets(): Promise<S3OperationResult<S3Bucket[]>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ buckets: Array<{ name: string; creationDate?: string }> }>('ListBuckets', {})
      if (result.success && result.data) {
        const buckets: S3Bucket[] = result.data.buckets.map((b) => ({
          name: b.name,
          creationDate: b.creationDate ? new Date(b.creationDate) : undefined,
        }))
        return { success: true, data: buckets }
      }
      return { success: false, error: result.error }
    }

    try {
      const client = getClient()
      const response = await client.send(new ListBucketsCommand({}))

      const buckets: S3Bucket[] = (response.Buckets ?? []).map((bucket: Bucket) => ({
        name: bucket.Name ?? '',
        creationDate: bucket.CreationDate,
      }))

      return { success: true, data: buckets }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Lists objects and folders within a bucket path. Uses delimiter-based listing
   * to simulate folder navigation - common prefixes appear as folders.
   * @param { string } bucket - Target bucket name
   * @param { string } prefix - Path prefix for filtering (e.g., 'images/2024/')
   * @param { object } options - Pagination and listing options
   * @param { number } options.maxKeys - Max results per page (default: 1000)
   * @param { string } options.continuationToken - Token from previous response for pagination
   * @param { string } options.delimiter - Character for folder grouping (default: '/')
   * @return { Promise<S3OperationResult<ListObjectsResult>> } Objects, folder prefixes, and pagination info
   */
  async function listObjects(
    bucket: string,
    prefix: string = '',
    options: {
      maxKeys?: number
      continuationToken?: string
      delimiter?: string
    } = {}
  ): Promise<S3OperationResult<ListObjectsResult>> {
    const { maxKeys = 1000, continuationToken, delimiter = '/' } = options

    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      interface ProxyListResult {
        contents: Array<{ key: string; lastModified?: string; size?: number; storageClass?: string; etag?: string }>
        commonPrefixes: string[]
        isTruncated?: boolean
        nextContinuationToken?: string
      }
      const result = await proxyS3Request<ProxyListResult>('ListObjectsV2', {
        bucket,
        prefix,
        delimiter,
        maxKeys,
        continuationToken,
      })
      if (result.success && result.data) {
        const objects: S3Object[] = result.data.contents.map((obj) => ({
          key: obj.key,
          size: obj.size ?? 0,
          lastModified: obj.lastModified ? new Date(obj.lastModified) : undefined,
          etag: obj.etag?.replace(/"/g, ''),
          storageClass: obj.storageClass,
          isFolder: false,
        }))
        return {
          success: true,
          data: {
            objects,
            prefixes: result.data.commonPrefixes,
            isTruncated: result.data.isTruncated ?? false,
            continuationToken,
            nextContinuationToken: result.data.nextContinuationToken,
          },
        }
      }
      return { success: false, error: result.error }
    }

    try {
      const client = getClient()

      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          Delimiter: delimiter,
          MaxKeys: maxKeys,
          ContinuationToken: continuationToken,
        })
      )

      const objects: S3Object[] = (response.Contents ?? []).map((obj: _Object) => ({
        key: obj.Key ?? '',
        size: obj.Size ?? 0,
        lastModified: obj.LastModified,
        etag: obj.ETag?.replace(/"/g, ''),
        storageClass: obj.StorageClass,
        isFolder: false,
      }))

      const prefixes: string[] = (response.CommonPrefixes ?? []).map(
        (cp: CommonPrefix) => cp.Prefix ?? ''
      )

      return {
        success: true,
        data: {
          objects,
          prefixes,
          isTruncated: response.IsTruncated ?? false,
          continuationToken,
          nextContinuationToken: response.NextContinuationToken,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Downloads an object's contents for preview or processing.
   * Returns a stream/blob depending on browser capabilities.
   * @param { string } bucket - Source bucket name
   * @param { string } key - Full object key path
   * @return { Promise<S3OperationResult<{ body, contentType, contentLength }>> } Object body and metadata
   */
  async function getObject(
    bucket: string,
    key: string
  ): Promise<S3OperationResult<{ body: ReadableStream | Blob | null; contentType: string | undefined; contentLength: number | undefined }>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )

      let body: ReadableStream | Blob | null = null

      if (response.Body) {
        // In browser environment, Body is a ReadableStream or Blob
        if (response.Body instanceof ReadableStream) {
          body = response.Body
        } else if (response.Body instanceof Blob) {
          body = response.Body
        } else if (typeof response.Body.transformToByteArray === 'function') {
          // AWS SDK v3 SdkStreamMixin
          const bytes = await response.Body.transformToByteArray()
          body = new Blob([bytes])
        }
      }

      return {
        success: true,
        data: {
          body,
          contentType: response.ContentType,
          contentLength: response.ContentLength,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Constructs the direct URL to an object (unsigned, for public objects only).
   * For authenticated access, use getPresignedUrl() instead.
   * @param { string } bucket - Bucket name
   * @param { string } key - Object key path
   * @throws { Error } If client not initialized
   * @return { string } Direct URL using path-style or virtual-hosted format
   */
  function getObjectUrl(bucket: string, key: string): string {
    if (!currentConfig) {
      throw new Error('S3 client not initialized')
    }

    const endpoint = currentConfig.endpoint.replace(/\/$/, '')

    if (currentConfig.forcePathStyle) {
      return `${endpoint}/${bucket}/${encodeURIComponent(key)}`
    } else {
      const url = new URL(endpoint)
      return `${url.protocol}//${bucket}.${url.host}/${encodeURIComponent(key)}`
    }
  }

  /**
   * Generates a time-limited signed URL for downloading a private object.
   * Use for sharing files or enabling browser downloads without exposing credentials.
   * @param { string } bucket - Bucket name
   * @param { string } key - Object key path
   * @param { number } expiresIn - Link validity in seconds (default: 3600 = 1 hour)
   * @return { Promise<string> } Signed URL that expires after the specified duration
   */
  async function getPresignedUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ url: string }>('GetPresignedUrl', {
        bucket,
        key,
        expiresIn,
      })
      if (result.success && result.data) {
        return result.data.url
      }
      throw new Error(result.error || 'Failed to get presigned URL')
    }

    const client = getClient()
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
    return getSignedUrl(client, command, { expiresIn })
  }

  /**
   * Simple single-request upload for small files. No progress tracking.
   * For large files or progress feedback, use uploadFile() instead.
   * @param { string } bucket - Target bucket name
   * @param { string } key - Destination key path
   * @param { Blob | ArrayBuffer | Uint8Array | string } body - File content
   * @param { object } options - Upload options
   * @param { string } options.contentType - MIME type (auto-detected if omitted)
   * @param { Record<string, string> } options.metadata - Custom x-amz-meta-* headers
   * @return { Promise<S3OperationResult<{ etag }>> } ETag of uploaded object on success
   */
  async function putObject(
    bucket: string,
    key: string,
    body: Blob | ArrayBuffer | Uint8Array | string,
    options: {
      contentType?: string
      metadata?: Record<string, string>
    } = {}
  ): Promise<S3OperationResult<{ etag: string | undefined }>> {
    try {
      const client = getClient()

      // Convert Blob to Uint8Array for browser compatibility
      let uploadBody: Uint8Array | string = body as Uint8Array | string
      if (body instanceof Blob) {
        const arrayBuffer = await body.arrayBuffer()
        uploadBody = new Uint8Array(arrayBuffer)
      } else if (body instanceof ArrayBuffer) {
        uploadBody = new Uint8Array(body)
      }

      const response = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: uploadBody,
          ContentType: options.contentType,
          Metadata: options.metadata,
        })
      )

      return {
        success: true,
        data: {
          etag: response.ETag?.replace(/"/g, ''),
        },
      }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // Threshold for multipart upload (5MB)
  const MULTIPART_THRESHOLD = 5 * 1024 * 1024

  /**
   * Uploads a file with progress tracking. Automatically uses multipart upload
   * for files > 5MB, enabling resume and better performance for large files.
   * @param { string } bucket - Target bucket name
   * @param { string } key - Destination key path
   * @param { File } file - File object to upload
   * @param { object } options - Upload options
   * @param { string } options.contentType - MIME type (defaults to file.type)
   * @param { Record<string, string> } options.metadata - Custom x-amz-meta-* headers
   * @param { (loaded: number, total: number) => void } options.onProgress - Callback for upload progress
   * @param { AbortSignal } options.abortSignal - Signal to cancel upload mid-flight
   * @return { Promise<S3OperationResult<{ etag }>> } ETag of uploaded object on success
   */
  async function uploadFile(
    bucket: string,
    key: string,
    file: File,
    options: {
      contentType?: string
      metadata?: Record<string, string>
      onProgress?: (loaded: number, total: number) => void
      abortSignal?: AbortSignal
    } = {}
  ): Promise<S3OperationResult<{ etag: string | undefined }>> {
    try {
      const client = getClient()
      const contentType = options.contentType || file.type || 'application/octet-stream'

      // For small files, use simple upload
      if (file.size < MULTIPART_THRESHOLD) {
        const arrayBuffer = await file.arrayBuffer()
        const body = new Uint8Array(arrayBuffer)

        // Report initial progress
        options.onProgress?.(0, file.size)

        const response = await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            Metadata: options.metadata,
          })
        )

        // Report completion
        options.onProgress?.(file.size, file.size)

        return {
          success: true,
          data: {
            etag: response.ETag?.replace(/"/g, ''),
          },
        }
      }

      // For large files, use multipart upload with progress tracking
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: file,
          ContentType: contentType,
          Metadata: options.metadata,
        },
        // 5MB parts
        partSize: 5 * 1024 * 1024,
        // Upload 4 parts concurrently
        queueSize: 4,
        // Leave a part in progress even if queue empties
        leavePartsOnError: false,
      })

      // Set up abort handling
      if (options.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          upload.abort()
        })
      }

      // Track progress
      upload.on('httpUploadProgress', (progress) => {
        options.onProgress?.(progress.loaded || 0, progress.total || file.size)
      })

      const result = await upload.done()

      return {
        success: true,
        data: {
          etag: result.ETag?.replace(/"/g, ''),
        },
      }
    } catch (error) {
      // Check if it was an abort
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Upload cancelled',
        }
      }
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Removes a single object from a bucket. Operation is idempotent -
   * deleting a non-existent key succeeds silently.
   * @param { string } bucket - Bucket containing the object
   * @param { string } key - Full key path of object to delete
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteObject(
    bucket: string,
    key: string
  ): Promise<S3OperationResult<boolean>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ deleted: boolean }>('DeleteObject', { bucket, key })
      return { success: result.success, data: result.success, error: result.error }
    }

    try {
      const client = getClient()
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )

      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Bulk delete multiple objects. Attempts efficient batch delete first,
   * falls back to sequential deletes if RGW denies bulk operations (common with limited permissions).
   * @param { string } bucket - Bucket containing the objects
   * @param { string[] } keys - Array of object keys to delete
   * @param { (current: number, total: number) => void } onProgress - Progress callback for sequential fallback
   * @return { Promise<S3OperationResult<{ deleted, errors }>> } Lists of successfully deleted keys and any failures
   */
  async function deleteObjects(
    bucket: string,
    keys: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<S3OperationResult<{ deleted: string[]; errors: Array<{ key: string; error: string }> }>> {
    if (keys.length === 0) {
      return {
        success: true,
        data: { deleted: [], errors: [] },
      }
    }

    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      interface ProxyDeleteResult {
        deleted: Array<{ key: string }>
        errors: Array<{ key: string; code?: string; message?: string }>
      }
      const result = await proxyS3Request<ProxyDeleteResult>('DeleteObjects', {
        bucket,
        objects: keys.map((key) => ({ key })),
      })
      if (result.success && result.data) {
        return {
          success: result.data.errors.length === 0,
          data: {
            deleted: result.data.deleted.map((d) => d.key),
            errors: result.data.errors.map((e) => ({ key: e.key, error: e.message || e.code || 'Unknown error' })),
          },
        }
      }
      return { success: false, error: result.error }
    }

    const client = getClient()

    // Try bulk delete first
    try {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      )

      const deleted = (response.Deleted ?? []).map((d) => d.Key ?? '').filter(Boolean)
      const errors = (response.Errors ?? []).map((e) => ({
        key: e.Key ?? '',
        error: e.Message ?? 'Unknown error',
      }))

      // If bulk delete worked (even partially), return the result
      if (deleted.length > 0 || errors.length === 0) {
        return {
          success: errors.length === 0,
          data: { deleted, errors },
        }
      }

      // If all items returned errors (likely AccessDenied), fall back to sequential
      const allAccessDenied = errors.every(e =>
        e.error.includes('AccessDenied') || e.error.includes('Access Denied')
      )

      if (!allAccessDenied) {
        // Errors are not access-related, return them
        return {
          success: false,
          data: { deleted, errors },
        }
      }
    } catch (error) {
      // Bulk delete command itself failed - check if it's access denied
      const errorMsg = formatError(error)
      if (!errorMsg.includes('Access denied') && !errorMsg.includes('AccessDenied')) {
        return {
          success: false,
          error: errorMsg,
        }
      }
    }

    // Fall back to sequential single deletes
    const deleted: string[] = []
    const errors: Array<{ key: string; error: string }> = []

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      onProgress?.(i + 1, keys.length)

      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        )
        deleted.push(key)
      } catch (error) {
        errors.push({
          key,
          error: formatError(error),
        })
      }
    }

    return {
      success: errors.length === 0,
      data: { deleted, errors },
    }
  }

  /**
   * Creates a new bucket with optional Ceph RGW placement and WORM compliance.
   * Handles backend-specific region quirks - Ceph ignores region, others require it.
   * @param { string } name - Bucket name (must be globally unique and DNS-compliant)
   * @param { string } locationConstraint - Ceph placement target from Admin API (optional)
   * @param { boolean } enableObjectLock - Enable immutable object storage (cannot be changed later)
   * @return { Promise<S3OperationResult<boolean>> } Success/failure of bucket creation
   */
  async function createBucket(
    name: string,
    locationConstraint?: string,
    enableObjectLock?: boolean
  ): Promise<S3OperationResult<boolean>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ created: boolean }>('CreateBucket', { bucket: name })
      return { success: result.success, data: result.success, error: result.error }
    }

    try {
      if (!currentConfig) {
        throw new Error('S3 client not initialized')
      }

      // Build params
      const params: CreateBucketCommandInput = {
        Bucket: name,
      }

      // Enable Object Lock if requested (can only be set at creation time)
      if (enableObjectLock) {
        params.ObjectLockEnabledForBucket = true
      }

      // Determine which client to use and whether to add LocationConstraint
      let clientToUse: S3Client
      const isCephBackend = backendType === 'ceph-rgw' || backendType === 'ceph-rgw-admin'

      if (locationConstraint && locationConstraint.trim() !== '') {
        // User explicitly selected a placement target - use it as LocationConstraint
        params.CreateBucketConfiguration = {
          LocationConstraint: locationConstraint as BucketLocationConstraint,
        }
        clientToUse = getClient()
      } else if (isCephBackend) {
        // Ceph RGW doesn't care about region - use us-east-1 to prevent
        // SDK middleware from auto-adding LocationConstraint
        clientToUse = new S3Client({
          endpoint: currentConfig.endpoint,
          region: 'us-east-1',
          forcePathStyle: currentConfig.forcePathStyle,
          credentials: {
            accessKeyId: currentConfig.accessKeyId,
            secretAccessKey: currentConfig.secretAccessKey,
          },
        })
      } else {
        // S3-compatible backend (MinIO, AWS, etc.) - use configured region
        // These backends require correct signing region
        clientToUse = getClient()
      }

      await clientToUse.send(new CreateBucketCommand(params))

      // Destroy temporary client if we created one
      if (clientToUse !== s3Client) {
        clientToUse.destroy()
      }

      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Permanently removes an empty bucket. Fails if bucket contains any objects.
   * @param { string } name - Bucket name to delete
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteBucket(name: string): Promise<S3OperationResult<boolean>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ deleted: boolean }>('DeleteBucket', { bucket: name })
      return { success: result.success, data: result.success, error: result.error }
    }

    try {
      const client = getClient()
      await client.send(new DeleteBucketCommand({ Bucket: name }))
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Verifies bucket existence and access permissions without listing contents.
   * Useful for quick permission checks before attempting operations.
   * @param { string } bucket - Bucket name to verify
   * @return { Promise<S3OperationResult<boolean>> } Success if bucket exists and is accessible
   */
  async function headBucket(bucket: string): Promise<S3OperationResult<boolean>> {
    // Use proxy mode if enabled
    if (proxyMode && (activePresetId || proxyCredentials)) {
      const result = await proxyS3Request<{ exists: boolean }>('HeadBucket', { bucket })
      return { success: result.success, data: result.success, error: result.error }
    }

    try {
      const client = getClient()
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // ===========================================================================
  // BUCKET VERSIONING
  // ===========================================================================

  /**
   * Retrieves bucket versioning configuration. Returns 'Disabled' if versioning
   * was never enabled, 'Suspended' if paused, or 'Enabled' if active.
   * @param { string } bucket - Bucket name to check
   * @return { Promise<S3OperationResult<BucketVersioning>> } Versioning status and MFA delete setting
   */
  async function getBucketVersioning(bucket: string): Promise<S3OperationResult<BucketVersioning>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketVersioningCommand({ Bucket: bucket })
      )

      // If Status is undefined, versioning has never been enabled
      const status: VersioningStatus = response.Status === 'Enabled'
        ? 'Enabled'
        : response.Status === 'Suspended'
          ? 'Suspended'
          : 'Disabled'

      return {
        success: true,
        data: {
          status,
          mfaDelete: response.MFADelete === 'Enabled',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Enables or suspends bucket versioning. Once enabled, versioning cannot be
   * fully disabled - only suspended. Suspended buckets keep existing versions.
   * @param { string } bucket - Target bucket name
   * @param { 'Enabled' | 'Suspended' } status - Versioning state to apply
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketVersioning(
    bucket: string,
    status: 'Enabled' | 'Suspended'
  ): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(
        new PutBucketVersioningCommand({
          Bucket: bucket,
          VersioningConfiguration: {
            Status: status,
          },
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // ===========================================================================
  // BUCKET LIFECYCLE
  // ===========================================================================

  /**
   * Fetches bucket lifecycle rules for automatic object transitions and expiration.
   * Returns empty array if no lifecycle configuration exists (not an error).
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<LifecycleRuleInfo[]>> } Array of lifecycle rules with expiration/transition settings
   */
  async function getBucketLifecycle(bucket: string): Promise<S3OperationResult<LifecycleRuleInfo[]>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })
      )

      const rules: LifecycleRuleInfo[] = (response.Rules ?? []).map((rule: LifecycleRule) => ({
        id: rule.ID ?? '',
        status: rule.Status as 'Enabled' | 'Disabled',
        prefix: rule.Prefix ?? rule.Filter?.Prefix,
        expirationDays: rule.Expiration?.Days,
        expirationDate: rule.Expiration?.Date,
        noncurrentVersionExpirationDays: rule.NoncurrentVersionExpiration?.NoncurrentDays,
        abortIncompleteMultipartUploadDays: rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation,
        transitions: rule.Transitions?.map(t => ({
          days: t.Days,
          date: t.Date,
          storageClass: t.StorageClass ?? '',
        })),
      }))

      return { success: true, data: rules }
    } catch (error) {
      // NoSuchLifecycleConfiguration means no rules exist - this is expected, not an error
      const awsError = error as Error & { Code?: string; name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
      const errorCode = awsError.Code || awsError.name || ''
      const errorMessage = awsError.message || ''
      const httpStatus = awsError.$metadata?.httpStatusCode
      const isNoLifecycle = errorCode.includes('NoSuchLifecycleConfiguration') ||
                            errorMessage.includes('NoSuchLifecycleConfiguration') ||
                            (httpStatus === 404 && (errorCode.includes('Lifecycle') || errorMessage.includes('Lifecycle')))

      if (isNoLifecycle) {
        return { success: true, data: [] }
      }
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Applies lifecycle rules for automatic object management. Replaces any existing
   * configuration. Use for data retention policies, storage class transitions, or cleanup.
   * @param { string } bucket - Target bucket name
   * @param { LifecycleRuleInfo[] } rules - Rules defining expiration and transition behavior
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketLifecycle(
    bucket: string,
    rules: LifecycleRuleInfo[]
  ): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()

      const lifecycleRules: LifecycleRule[] = rules.map(rule => ({
        ID: rule.id,
        Status: rule.status,
        Filter: rule.prefix ? { Prefix: rule.prefix } : undefined,
        Expiration: rule.expirationDays
          ? { Days: rule.expirationDays }
          : rule.expirationDate
            ? { Date: rule.expirationDate }
            : undefined,
        NoncurrentVersionExpiration: rule.noncurrentVersionExpirationDays
          ? { NoncurrentDays: rule.noncurrentVersionExpirationDays }
          : undefined,
        AbortIncompleteMultipartUpload: rule.abortIncompleteMultipartUploadDays
          ? { DaysAfterInitiation: rule.abortIncompleteMultipartUploadDays }
          : undefined,
        Transitions: rule.transitions?.map(t => ({
          Days: t.days,
          Date: t.date,
          StorageClass: t.storageClass as 'GLACIER' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'DEEP_ARCHIVE' | 'GLACIER_IR',
        })),
      }))

      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: {
            Rules: lifecycleRules,
          },
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Removes all lifecycle rules from a bucket. Objects will no longer be
   * automatically expired or transitioned to different storage classes.
   * @param { string } bucket - Bucket name to clear lifecycle from
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteBucketLifecycle(bucket: string): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(new DeleteBucketLifecycleCommand({ Bucket: bucket }))
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // ===========================================================================
  // BUCKET POLICY
  // ===========================================================================

  /**
   * Retrieves the bucket's IAM-style access policy document.
   * Returns null if no policy is set (bucket uses default ACL-based access).
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<string | null>> } Policy JSON string or null if none exists
   */
  async function getBucketPolicy(bucket: string): Promise<S3OperationResult<string | null>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketPolicyCommand({ Bucket: bucket })
      )
      return { success: true, data: response.Policy ?? null }
    } catch (error) {
      // NoSuchBucketPolicy means no policy exists - this is expected, not an error
      const awsError = error as Error & { Code?: string; name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
      const errorCode = awsError.Code || awsError.name || ''
      const errorMessage = awsError.message || ''
      const httpStatus = awsError.$metadata?.httpStatusCode
      const isNoPolicy = errorCode.includes('NoSuchBucketPolicy') ||
                         errorMessage.includes('NoSuchBucketPolicy') ||
                         (httpStatus === 404 && (errorCode.includes('Policy') || errorMessage.includes('Policy')))

      if (isNoPolicy) {
        return { success: true, data: null }
      }
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Applies an IAM-style access policy to the bucket. Replaces any existing policy.
   * Policy must be valid JSON following AWS IAM policy syntax.
   * @param { string } bucket - Target bucket name
   * @param { string } policy - JSON policy document string
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketPolicy(bucket: string, policy: string): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(
        new PutBucketPolicyCommand({
          Bucket: bucket,
          Policy: policy,
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Removes the bucket policy, reverting to ACL-based access control.
   * @param { string } bucket - Bucket name to clear policy from
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteBucketPolicy(bucket: string): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }))
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // ===========================================================================
  // BUCKET ACL
  // ===========================================================================

  /**
   * Retrieves the bucket's Access Control List showing owner and granted permissions.
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<BucketAcl>> } Owner info and list of grants with grantee/permission pairs
   */
  async function getBucketAcl(bucket: string): Promise<S3OperationResult<BucketAcl>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketAclCommand({ Bucket: bucket })
      )

      const owner = response.Owner as Owner
      const grants = (response.Grants ?? []) as Grant[]

      const acl: BucketAcl = {
        owner: {
          id: owner?.ID ?? '',
          displayName: owner?.DisplayName,
        },
        grants: grants.map(grant => ({
          grantee: {
            type: grant.Grantee?.Type as 'CanonicalUser' | 'AmazonCustomerByEmail' | 'Group',
            id: grant.Grantee?.ID,
            displayName: grant.Grantee?.DisplayName,
            emailAddress: grant.Grantee?.EmailAddress,
            uri: grant.Grantee?.URI,
          },
          permission: grant.Permission as 'FULL_CONTROL' | 'WRITE' | 'WRITE_ACP' | 'READ' | 'READ_ACP',
        })),
      }

      return { success: true, data: acl }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  /**
   * Sets bucket access using predefined ACL templates.
   * @param { string } bucket - Target bucket name
   * @param { 'private' | 'public-read' | 'public-read-write' | 'authenticated-read' } cannedAcl - Predefined ACL
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketAcl(
    bucket: string,
    cannedAcl: 'private' | 'public-read' | 'public-read-write' | 'authenticated-read'
  ): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(
        new PutBucketAclCommand({
          Bucket: bucket,
          ACL: cannedAcl,
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return {
        success: false,
        error: formatError(error),
      }
    }
  }

  // ===========================================================================
  // BUCKET ENCRYPTION
  // ===========================================================================

  /**
   * Retrieves default server-side encryption settings for the bucket.
   * Returns null if no default encryption is configured.
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<BucketEncryption | null>> } Encryption algorithm and KMS key info
   */
  async function getBucketEncryption(bucket: string): Promise<S3OperationResult<BucketEncryption | null>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketEncryptionCommand({ Bucket: bucket })
      )

      const rules = response.ServerSideEncryptionConfiguration?.Rules
      const rule = rules?.[0]
      if (!rule) {
        return { success: true, data: null }
      }

      return {
        success: true,
        data: {
          sseAlgorithm: (rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm as 'AES256' | 'aws:kms') || 'AES256',
          kmsMasterKeyId: rule.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID,
          bucketKeyEnabled: rule.BucketKeyEnabled,
        },
      }
    } catch (error) {
      // ServerSideEncryptionConfigurationNotFoundError means no encryption
      const awsError = error as Error & { Code?: string; name?: string; message?: string }
      const errorCode = awsError.Code || awsError.name || ''
      if (errorCode.includes('ServerSideEncryptionConfigurationNotFound') ||
          awsError.message?.includes('ServerSideEncryptionConfigurationNotFound')) {
        return { success: true, data: null }
      }
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Configures default server-side encryption for all new objects in the bucket.
   * Supports AES-256 (S3-managed) or aws:kms (customer-managed keys).
   * @param { string } bucket - Target bucket name
   * @param { BucketEncryption } encryption - Encryption algorithm and optional KMS key ID
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketEncryption(
    bucket: string,
    encryption: BucketEncryption
  ): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(
        new PutBucketEncryptionCommand({
          Bucket: bucket,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: encryption.sseAlgorithm,
                  KMSMasterKeyID: encryption.kmsMasterKeyId,
                },
                BucketKeyEnabled: encryption.bucketKeyEnabled,
              },
            ],
          },
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Removes default encryption, allowing unencrypted uploads.
   * Existing encrypted objects are not affected.
   * @param { string } bucket - Bucket name to clear encryption from
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteBucketEncryption(bucket: string): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(new DeleteBucketEncryptionCommand({ Bucket: bucket }))
      return { success: true, data: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  // ===========================================================================
  // BUCKET TAGGING
  // ===========================================================================

  /**
   * Retrieves bucket tags for cost allocation, organization, or automation.
   * Returns empty array if no tags are set.
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<BucketTag[]>> } Array of key-value tag pairs
   */
  async function getBucketTagging(bucket: string): Promise<S3OperationResult<BucketTag[]>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetBucketTaggingCommand({ Bucket: bucket })
      )

      const tags: BucketTag[] = (response.TagSet || []).map((tag: Tag) => ({
        key: tag.Key || '',
        value: tag.Value || '',
      }))

      return { success: true, data: tags }
    } catch (error) {
      // NoSuchTagSet means no tags
      const awsError = error as Error & { Code?: string; name?: string; message?: string }
      const errorCode = awsError.Code || awsError.name || ''
      if (errorCode.includes('NoSuchTagSet') || awsError.message?.includes('NoSuchTagSet')) {
        return { success: true, data: [] }
      }
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Applies tags to a bucket, replacing any existing tags.
   * Useful for cost tracking, environment labeling, or automation triggers.
   * @param { string } bucket - Target bucket name
   * @param { BucketTag[] } tags - Array of key-value pairs to apply
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putBucketTagging(bucket: string, tags: BucketTag[]): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(
        new PutBucketTaggingCommand({
          Bucket: bucket,
          Tagging: {
            TagSet: tags.map(tag => ({
              Key: tag.key,
              Value: tag.value,
            })),
          },
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Removes all tags from a bucket.
   * @param { string } bucket - Bucket name to clear tags from
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function deleteBucketTagging(bucket: string): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()
      await client.send(new DeleteBucketTaggingCommand({ Bucket: bucket }))
      return { success: true, data: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  // ===========================================================================
  // OBJECT LOCK
  // ===========================================================================

  /**
   * Retrieves Object Lock (WORM) configuration for compliance/governance mode.
   * Returns null if Object Lock is not enabled on the bucket.
   * @param { string } bucket - Bucket name to query
   * @return { Promise<S3OperationResult<ObjectLockConfig | null>> } Lock mode and default retention period
   */
  async function getObjectLockConfiguration(bucket: string): Promise<S3OperationResult<ObjectLockConfig | null>> {
    try {
      const client = getClient()
      const response = await client.send(
        new GetObjectLockConfigurationCommand({ Bucket: bucket })
      )

      const config = response.ObjectLockConfiguration
      if (!config) {
        return { success: true, data: null }
      }

      return {
        success: true,
        data: {
          enabled: config.ObjectLockEnabled === 'Enabled',
          mode: config.Rule?.DefaultRetention?.Mode as 'GOVERNANCE' | 'COMPLIANCE' | undefined,
          days: config.Rule?.DefaultRetention?.Days,
          years: config.Rule?.DefaultRetention?.Years,
        },
      }
    } catch (error) {
      // ObjectLockConfigurationNotFoundError means no object lock
      const awsError = error as Error & { Code?: string; name?: string; message?: string }
      const errorCode = awsError.Code || awsError.name || ''
      if (errorCode.includes('ObjectLockConfigurationNotFound') ||
          awsError.message?.includes('ObjectLockConfigurationNotFound')) {
        return { success: true, data: null }
      }
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Updates default Object Lock retention settings. Object Lock must have been
   * enabled at bucket creation time - this only configures default retention.
   * @param { string } bucket - Bucket with Object Lock enabled
   * @param { ObjectLockConfig } config - Retention mode (GOVERNANCE/COMPLIANCE) and duration
   * @return { Promise<S3OperationResult<boolean>> } Success/failure status
   */
  async function putObjectLockConfiguration(
    bucket: string,
    config: ObjectLockConfig
  ): Promise<S3OperationResult<boolean>> {
    try {
      const client = getClient()

      const lockConfig: ObjectLockConfiguration = {
        ObjectLockEnabled: config.enabled ? 'Enabled' : undefined,
      }

      if (config.mode && (config.days || config.years)) {
        lockConfig.Rule = {
          DefaultRetention: {
            Mode: config.mode,
            Days: config.days,
            Years: config.years,
          },
        }
      }

      await client.send(
        new PutObjectLockConfigurationCommand({
          Bucket: bucket,
          ObjectLockConfiguration: lockConfig,
        })
      )
      return { success: true, data: true }
    } catch (error) {
      return { success: false, error: formatError(error) }
    }
  }

  /**
   * Converts AWS SDK errors into human-readable messages.
   * Handles common S3 error codes with specific helpful messages.
   * @param { unknown } error - Error from AWS SDK or other source
   * @return { string } User-friendly error description
   */
  function formatError(error: unknown): string {
    if (error instanceof Error) {
      // Handle AWS SDK specific errors
      const awsError = error as Error & {
        Code?: string
        Region?: string
        $metadata?: { httpStatusCode?: number }
        message?: string
      }

      if (awsError.Code) {
        switch (awsError.Code) {
          case 'InvalidAccessKeyId':
            return 'Invalid access key ID'
          case 'SignatureDoesNotMatch':
            return 'Invalid secret access key'
          case 'AccessDenied':
            return 'Access denied. Check your credentials and permissions.'
          case 'NoSuchBucket':
            return 'Bucket does not exist'
          case 'NoSuchKey':
            return 'Object does not exist'
          case 'BucketNotEmpty':
            return 'Bucket is not empty'
          case 'BucketAlreadyExists':
            return 'Bucket name already exists'
          case 'BucketAlreadyOwnedByYou':
            return 'You already own this bucket'
          case 'AuthorizationHeaderMalformed': {
            // Try to extract the expected region from the error message
            // AWS/MinIO return: "The authorization header is malformed; the region 'X' is wrong; expecting 'Y'"
            const regionMatch = error.message.match(/expecting ['"]?([a-z0-9-]+)['"]?/i)
            if (regionMatch?.[1]) {
              return `Region mismatch. Expected region: '${regionMatch[1]}'. Update your region setting and reconnect.`
            }
            // Check if there's a Region property on the error
            if (awsError.Region) {
              return `Region mismatch. Expected region: '${awsError.Region}'. Update your region setting and reconnect.`
            }
            return 'Authorization header malformed. Check your region setting matches the server configuration.'
          }
          case 'InvalidRegion':
            return 'Invalid region. Check that your region setting matches the server configuration.'
          case 'PermanentRedirect': {
            // S3 returns this when you use wrong region - extract the correct one
            const redirectMatch = error.message.match(/endpoint\s+([a-z0-9.-]+)/i)
            if (redirectMatch?.[1]) {
              return `Wrong region. The bucket is in a different region. Check the endpoint: ${redirectMatch[1]}`
            }
            return 'Wrong region. The bucket is in a different region.'
          }
          default:
            return awsError.Code
        }
      }

      if (awsError.$metadata?.httpStatusCode) {
        const status = awsError.$metadata.httpStatusCode
        if (status === 301) return 'Bucket is in a different region. Check your region setting.'
        if (status === 403) return 'Access denied. Check your credentials.'
        if (status === 404) return 'Resource not found'
        if (status >= 500) return 'Server error. Please try again.'
      }

      // Check for region-related messages in the error text
      if (error.message.includes('region') && error.message.includes('wrong')) {
        const regionMatch = error.message.match(/expecting ['"]?([a-z0-9-]+)['"]?/i)
        if (regionMatch?.[1]) {
          return `Region mismatch. Expected region: '${regionMatch[1]}'. Update your region setting and reconnect.`
        }
      }

      // Network errors
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        return 'Network error. Check your endpoint URL and connectivity.'
      }

      if (error.message.includes('CORS')) {
        return 'CORS error. Ensure your RGW is configured to allow requests from this origin.'
      }

      return error.message
    }

    return 'An unexpected error occurred'
  }

  return {
    initializeClient,
    getClient,
    isInitialized,
    destroyClient,
    // Backend type
    setBackendType,
    getBackendType,
    // Proxy mode
    enableProxyMode,
    enableProxyModeWithCredentials,
    disableProxyMode,
    isProxyMode,
    getActivePresetId,
    // Operations
    testConnection,
    listBuckets,
    createBucket,
    deleteBucket,
    listObjects,
    getObject,
    getObjectUrl,
    getPresignedUrl,
    putObject,
    uploadFile,
    deleteObject,
    deleteObjects,
    headBucket,
    // Bucket settings
    getBucketVersioning,
    putBucketVersioning,
    getBucketLifecycle,
    putBucketLifecycle,
    deleteBucketLifecycle,
    getBucketPolicy,
    putBucketPolicy,
    deleteBucketPolicy,
    getBucketAcl,
    putBucketAcl,
    // Encryption
    getBucketEncryption,
    putBucketEncryption,
    deleteBucketEncryption,
    // Tagging
    getBucketTagging,
    putBucketTagging,
    deleteBucketTagging,
    // Object Lock
    getObjectLockConfiguration,
    putObjectLockConfiguration,
  }
}
