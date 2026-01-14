import { SignatureV4 } from '@smithy/signature-v4'
import { HttpRequest } from '@smithy/protocol-http'
import { Sha256 } from '@aws-crypto/sha256-js'
import { getPresetById, isProxyPreset } from '../../utils/presets'
import type { AdminProxyRequest, ProxyResponse } from '../../../app/types/connection'

// =============================================================================
// TYPES
// =============================================================================

interface AdminCredentials {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * POST /api/proxy/admin
 *
 * Proxies RGW Admin API requests for:
 * 1. Proxy-enabled presets (credentials from server env)
 * 2. Saved connections with useProxy (credentials from request)
 */
export default defineEventHandler(async (event): Promise<ProxyResponse> => {
  const body = await readBody<AdminProxyRequest>(event)

  // Validate request - need path and either presetId or credentials
  if (!body?.path) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: path',
    })
  }

  if (!body.presetId && !body.credentials) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: presetId or credentials',
    })
  }

  const { presetId, credentials, path, method = 'GET', queryParams = {}, body: requestBody } = body

  // Get credentials from preset or direct credentials
  let adminCreds: AdminCredentials | null = null

  if (presetId) {
    // Validate preset exists and is proxy-enabled
    if (!isProxyPreset(presetId)) {
      throw createError({
        statusCode: 403,
        message: 'Preset not found or not proxy-enabled',
      })
    }

    // Get preset credentials
    const preset = getPresetById(presetId)
    if (!preset || !preset.accessKey || !preset.secretKey) {
      throw createError({
        statusCode: 500,
        message: 'Preset credentials not configured',
      })
    }

    adminCreds = {
      endpoint: preset.endpoint,
      accessKey: preset.accessKey,
      secretKey: preset.secretKey,
      region: preset.region,
    }
  } else if (credentials) {
    // Validate direct credentials
    if (!credentials.endpoint || !credentials.accessKey || !credentials.secretKey) {
      throw createError({
        statusCode: 400,
        message: 'Invalid credentials: endpoint, accessKey, and secretKey are required',
      })
    }

    adminCreds = {
      endpoint: credentials.endpoint,
      accessKey: credentials.accessKey,
      secretKey: credentials.secretKey,
      region: credentials.region || 'us-east-1',
    }
  }

  if (!adminCreds) {
    throw createError({
      statusCode: 500,
      message: 'Failed to resolve credentials',
    })
  }

  try {
    const endpoint = new URL(adminCreds.endpoint)

    // Build query string with format=json
    const searchParams = new URLSearchParams({ format: 'json', ...queryParams })

    // Determine port
    const port = endpoint.port
      ? parseInt(endpoint.port)
      : endpoint.protocol === 'https:'
        ? 443
        : 80

    // Create the HTTP request
    const request = new HttpRequest({
      method,
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port,
      path: path,
      query: Object.fromEntries(searchParams),
      headers: {
        host: endpoint.host,
        'content-type': 'application/json',
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    })

    // Create signer
    const signer = new SignatureV4({
      credentials: {
        accessKeyId: adminCreds.accessKey,
        secretAccessKey: adminCreds.secretKey,
      },
      region: adminCreds.region,
      service: 's3',
      sha256: Sha256,
    })

    // Sign the request
    const signedRequest = await signer.sign(request)

    // Build the full URL
    const url = `${endpoint.protocol}//${endpoint.host}${path}?${searchParams.toString()}`

    // Make the fetch call
    const fetchOptions: RequestInit = {
      method: signedRequest.method,
      headers: signedRequest.headers as Record<string, string>,
    }

    // Add body for POST/PUT requests
    if (requestBody && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = JSON.stringify(requestBody)
    }

    const response = await fetch(url, fetchOptions)

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
        statusCode: response.status,
      }
    }

    // Parse and return the response
    // Always try to parse as JSON first since we request format=json
    // RGW might not always return application/json content-type
    let data: unknown
    const text = await response.text()

    try {
      data = JSON.parse(text)
    } catch {
      // If JSON parsing fails, return as text
      data = text
    }

    return { success: true, data }
  } catch (error) {
    const err = error as Error
    return {
      success: false,
      error: err.message || 'Admin API request failed',
      statusCode: 500,
    }
  }
})
