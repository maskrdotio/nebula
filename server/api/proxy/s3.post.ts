import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
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
  ListObjectVersionsCommand,
  type BucketCannedACL,
} from '@aws-sdk/client-s3'
import { getPresetById, isProxyPreset } from '../../utils/presets'
import { createObjectProxyUrl } from './object.get'
import type { S3ProxyRequest, ProxyResponse, ProxyCredentials } from '../../../app/types/connection'

// Node.js Buffer type for server-side code
declare const Buffer: {
  from(str: string, encoding?: string): Uint8Array
}

// =============================================================================
// S3 CLIENT CACHE
// =============================================================================

const clientCache = new Map<string, S3Client>()

/**
 * Get or create an S3 client for a preset.
 */
function getS3ClientForPreset(presetId: string): S3Client | null {
  // Check cache first
  if (clientCache.has(presetId)) {
    return clientCache.get(presetId)!
  }

  const preset = getPresetById(presetId)
  if (!preset || !preset.accessKey || !preset.secretKey) {
    return null
  }

  const client = new S3Client({
    endpoint: preset.endpoint,
    region: preset.region,
    forcePathStyle: preset.pathStyle,
    credentials: {
      accessKeyId: preset.accessKey,
      secretAccessKey: preset.secretKey,
    },
  })

  clientCache.set(presetId, client)
  return client
}

/**
 * Create an S3 client from direct credentials (for saved connections with useProxy).
 * These clients are not cached since credentials come from the client.
 */
function createS3ClientFromCredentials(credentials: ProxyCredentials): S3Client {
  return new S3Client({
    endpoint: credentials.endpoint,
    region: credentials.region,
    forcePathStyle: credentials.pathStyle,
    credentials: {
      accessKeyId: credentials.accessKey,
      secretAccessKey: credentials.secretKey,
    },
  })
}

// =============================================================================
// OPERATION HANDLERS
// =============================================================================

type OperationHandler = (
  client: S3Client,
  params: Record<string, unknown>
) => Promise<unknown>

const operations: Record<string, OperationHandler> = {
  // Bucket operations
  ListBuckets: async (client) => {
    const result = await client.send(new ListBucketsCommand({}))
    return {
      buckets: result.Buckets?.map((b) => ({
        name: b.Name,
        creationDate: b.CreationDate?.toISOString(),
      })) ?? [],
      owner: result.Owner,
    }
  },

  HeadBucket: async (client, params) => {
    await client.send(new HeadBucketCommand({ Bucket: params['bucket'] as string }))
    return { exists: true }
  },

  CreateBucket: async (client, params) => {
    await client.send(new CreateBucketCommand({ Bucket: params['bucket'] as string }))
    return { created: true }
  },

  DeleteBucket: async (client, params) => {
    await client.send(new DeleteBucketCommand({ Bucket: params['bucket'] as string }))
    return { deleted: true }
  },

  // Object operations
  ListObjectsV2: async (client, params) => {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: params['bucket'] as string,
      Prefix: params['prefix'] as string | undefined,
      Delimiter: params['delimiter'] as string | undefined,
      MaxKeys: params['maxKeys'] as number | undefined,
      ContinuationToken: params['continuationToken'] as string | undefined,
    }))
    return {
      contents: result.Contents?.map((obj) => ({
        key: obj.Key,
        lastModified: obj.LastModified?.toISOString(),
        size: obj.Size,
        storageClass: obj.StorageClass,
        etag: obj.ETag,
      })) ?? [],
      commonPrefixes: result.CommonPrefixes?.map((p) => p.Prefix) ?? [],
      isTruncated: result.IsTruncated,
      nextContinuationToken: result.NextContinuationToken,
      keyCount: result.KeyCount,
    }
  },

  HeadObject: async (client, params) => {
    const result = await client.send(new HeadObjectCommand({
      Bucket: params['bucket'] as string,
      Key: params['key'] as string,
    }))
    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified?.toISOString(),
      etag: result.ETag,
      metadata: result.Metadata,
      storageClass: result.StorageClass,
      versionId: result.VersionId,
    }
  },

  // Note: GetPresignedUrl is handled specially in the main handler
  // to return proxy URLs instead of direct S3 presigned URLs

  PutObject: async (client, params) => {
    // For proxy mode, we expect the body to be base64 encoded
    let body: Uint8Array | string | undefined
    if (params['body']) {
      if (params['bodyEncoding'] === 'base64') {
        body = Buffer.from(params['body'] as string, 'base64')
      } else {
        body = params['body'] as string
      }
    }

    const result = await client.send(new PutObjectCommand({
      Bucket: params['bucket'] as string,
      Key: params['key'] as string,
      Body: body,
      ContentType: params['contentType'] as string | undefined,
      Metadata: params['metadata'] as Record<string, string> | undefined,
    }))
    return {
      etag: result.ETag,
      versionId: result.VersionId,
    }
  },

  DeleteObject: async (client, params) => {
    const result = await client.send(new DeleteObjectCommand({
      Bucket: params['bucket'] as string,
      Key: params['key'] as string,
      VersionId: params['versionId'] as string | undefined,
    }))
    return {
      deleted: true,
      versionId: result.VersionId,
      deleteMarker: result.DeleteMarker,
    }
  },

  DeleteObjects: async (client, params) => {
    const objects = params['objects'] as Array<{ key: string; versionId?: string }>
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: params['bucket'] as string,
      Delete: {
        Objects: objects.map((o) => ({ Key: o.key, VersionId: o.versionId })),
        Quiet: params['quiet'] as boolean | undefined,
      },
    }))
    return {
      deleted: result.Deleted?.map((d) => ({
        key: d.Key,
        versionId: d.VersionId,
        deleteMarker: d.DeleteMarker,
      })) ?? [],
      errors: result.Errors?.map((e) => ({
        key: e.Key,
        code: e.Code,
        message: e.Message,
      })) ?? [],
    }
  },

  CopyObject: async (client, params) => {
    const result = await client.send(new CopyObjectCommand({
      Bucket: params['destBucket'] as string,
      Key: params['destKey'] as string,
      CopySource: `${params['sourceBucket']}/${params['sourceKey']}`,
    }))
    return {
      etag: result.CopyObjectResult?.ETag,
      lastModified: result.CopyObjectResult?.LastModified?.toISOString(),
      versionId: result.VersionId,
    }
  },

  // Versioning
  GetBucketVersioning: async (client, params) => {
    const result = await client.send(new GetBucketVersioningCommand({
      Bucket: params['bucket'] as string,
    }))
    return {
      status: result.Status,
      mfaDelete: result.MFADelete,
    }
  },

  PutBucketVersioning: async (client, params) => {
    await client.send(new PutBucketVersioningCommand({
      Bucket: params['bucket'] as string,
      VersioningConfiguration: {
        Status: params['status'] as 'Enabled' | 'Suspended',
      },
    }))
    return { updated: true }
  },

  ListObjectVersions: async (client, params) => {
    const result = await client.send(new ListObjectVersionsCommand({
      Bucket: params['bucket'] as string,
      Prefix: params['prefix'] as string | undefined,
      MaxKeys: params['maxKeys'] as number | undefined,
      KeyMarker: params['keyMarker'] as string | undefined,
      VersionIdMarker: params['versionIdMarker'] as string | undefined,
    }))
    return {
      versions: result.Versions?.map((v) => ({
        key: v.Key,
        versionId: v.VersionId,
        isLatest: v.IsLatest,
        lastModified: v.LastModified?.toISOString(),
        size: v.Size,
        storageClass: v.StorageClass,
      })) ?? [],
      deleteMarkers: result.DeleteMarkers?.map((d) => ({
        key: d.Key,
        versionId: d.VersionId,
        isLatest: d.IsLatest,
        lastModified: d.LastModified?.toISOString(),
      })) ?? [],
      isTruncated: result.IsTruncated,
      nextKeyMarker: result.NextKeyMarker,
      nextVersionIdMarker: result.NextVersionIdMarker,
    }
  },

  // Lifecycle
  GetBucketLifecycleConfiguration: async (client, params) => {
    const result = await client.send(new GetBucketLifecycleConfigurationCommand({
      Bucket: params['bucket'] as string,
    }))
    return { rules: result.Rules }
  },

  PutBucketLifecycleConfiguration: async (client, params) => {
    await client.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: params['bucket'] as string,
      LifecycleConfiguration: {
        Rules: params['rules'] as never[],
      },
    }))
    return { updated: true }
  },

  DeleteBucketLifecycle: async (client, params) => {
    await client.send(new DeleteBucketLifecycleCommand({
      Bucket: params['bucket'] as string,
    }))
    return { deleted: true }
  },

  // Policy
  GetBucketPolicy: async (client, params) => {
    const result = await client.send(new GetBucketPolicyCommand({
      Bucket: params['bucket'] as string,
    }))
    return { policy: result.Policy }
  },

  PutBucketPolicy: async (client, params) => {
    await client.send(new PutBucketPolicyCommand({
      Bucket: params['bucket'] as string,
      Policy: params['policy'] as string,
    }))
    return { updated: true }
  },

  DeleteBucketPolicy: async (client, params) => {
    await client.send(new DeleteBucketPolicyCommand({
      Bucket: params['bucket'] as string,
    }))
    return { deleted: true }
  },

  // ACL
  GetBucketAcl: async (client, params) => {
    const result = await client.send(new GetBucketAclCommand({
      Bucket: params['bucket'] as string,
    }))
    return {
      owner: result.Owner,
      grants: result.Grants,
    }
  },

  PutBucketAcl: async (client, params) => {
    await client.send(new PutBucketAclCommand({
      Bucket: params['bucket'] as string,
      ACL: params['acl'] as BucketCannedACL | undefined,
      AccessControlPolicy: params['accessControlPolicy'] as never,
    }))
    return { updated: true }
  },

  // Encryption
  GetBucketEncryption: async (client, params) => {
    const result = await client.send(new GetBucketEncryptionCommand({
      Bucket: params['bucket'] as string,
    }))
    return { configuration: result.ServerSideEncryptionConfiguration }
  },

  PutBucketEncryption: async (client, params) => {
    await client.send(new PutBucketEncryptionCommand({
      Bucket: params['bucket'] as string,
      ServerSideEncryptionConfiguration: params['configuration'] as never,
    }))
    return { updated: true }
  },

  DeleteBucketEncryption: async (client, params) => {
    await client.send(new DeleteBucketEncryptionCommand({
      Bucket: params['bucket'] as string,
    }))
    return { deleted: true }
  },

  // Tagging
  GetBucketTagging: async (client, params) => {
    const result = await client.send(new GetBucketTaggingCommand({
      Bucket: params['bucket'] as string,
    }))
    return { tagSet: result.TagSet }
  },

  PutBucketTagging: async (client, params) => {
    await client.send(new PutBucketTaggingCommand({
      Bucket: params['bucket'] as string,
      Tagging: { TagSet: params['tagSet'] as never[] },
    }))
    return { updated: true }
  },

  DeleteBucketTagging: async (client, params) => {
    await client.send(new DeleteBucketTaggingCommand({
      Bucket: params['bucket'] as string,
    }))
    return { deleted: true }
  },

  // Object Lock
  GetObjectLockConfiguration: async (client, params) => {
    const result = await client.send(new GetObjectLockConfigurationCommand({
      Bucket: params['bucket'] as string,
    }))
    return { configuration: result.ObjectLockConfiguration }
  },

  PutObjectLockConfiguration: async (client, params) => {
    await client.send(new PutObjectLockConfigurationCommand({
      Bucket: params['bucket'] as string,
      ObjectLockConfiguration: params['configuration'] as never,
    }))
    return { updated: true }
  },
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * POST /api/proxy/s3
 *
 * Proxies S3 operations for:
 * 1. Proxy-enabled presets (credentials from server env)
 * 2. Saved connections with useProxy (credentials from request)
 */
export default defineEventHandler(async (event): Promise<ProxyResponse> => {
  const body = await readBody<S3ProxyRequest>(event)

  // Validate request - need either presetId or credentials
  if (!body?.operation) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: operation',
    })
  }

  if (!body.presetId && !body.credentials) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: presetId or credentials',
    })
  }

  const { presetId, credentials, operation, params = {} } = body

  let client: S3Client | null = null
  let shouldDestroyClient = false

  // Get S3 client from preset or credentials
  if (presetId) {
    // Using a preset - validate it exists and is proxy-enabled
    if (!isProxyPreset(presetId)) {
      throw createError({
        statusCode: 403,
        message: 'Preset not found or not proxy-enabled',
      })
    }

    client = getS3ClientForPreset(presetId)
    if (!client) {
      throw createError({
        statusCode: 500,
        message: 'Failed to initialize S3 client - credentials may not be configured',
      })
    }
  } else if (credentials) {
    // Using direct credentials - validate required fields
    if (!credentials.endpoint || !credentials.accessKey || !credentials.secretKey) {
      throw createError({
        statusCode: 400,
        message: 'Invalid credentials: endpoint, accessKey, and secretKey are required',
      })
    }

    client = createS3ClientFromCredentials(credentials)
    shouldDestroyClient = true // Clean up after use since not cached
  }

  if (!client) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create S3 client',
    })
  }

  // Special handling for GetPresignedUrl - returns proxy URL instead of direct S3 URL
  // This ensures objects are accessible even when the S3 endpoint is internal/unreachable
  if (operation === 'GetPresignedUrl') {
    if (shouldDestroyClient) client.destroy()

    const bucket = params['bucket'] as string
    const key = params['key'] as string
    const expiresIn = (params['expiresIn'] as number) || 3600

    if (!bucket || !key) {
      throw createError({
        statusCode: 400,
        message: 'Missing required parameters: bucket and key',
      })
    }

    const url = createObjectProxyUrl({
      presetId: presetId || undefined,
      credentials: credentials || undefined,
      bucket,
      key,
      expiresIn,
    })

    return { success: true, data: { url, expiresIn } }
  }

  // Check if operation is supported
  const handler = operations[operation]
  if (!handler) {
    if (shouldDestroyClient) client.destroy()
    throw createError({
      statusCode: 400,
      message: `Unsupported operation: ${operation}`,
    })
  }

  // Execute operation
  try {
    const data = await handler(client, params)
    if (shouldDestroyClient) client.destroy()
    return { success: true, data }
  } catch (error) {
    if (shouldDestroyClient) client.destroy()

    // Extract error details without exposing internals
    const err = error as Error & { Code?: string; $metadata?: { httpStatusCode?: number } }
    const statusCode = err.$metadata?.httpStatusCode || 500
    const message = err.Code || err.message || 'Operation failed'

    return {
      success: false,
      error: message,
      statusCode,
    }
  }
})
