import {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'

const SENSITIVE_KEY_REGEX = /(password|secret|token|authorization|cookie|api[_-]?key|phone|email|otp)/i
const streamState = new Map()

let cwClient

function isCloudWatchEnabled() {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  )
}

function getClient() {
  if (!isCloudWatchEnabled()) return null
  if (!cwClient) {
    cwClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION })
  }
  return cwClient
}

function sanitizeValue(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY_REGEX.test(k) ? '[REDACTED]' : sanitizeValue(v)
    }
    return out
  }
  return value
}

function sanitizeRoute(route) {
  return String(route || 'api').replace(/[^a-zA-Z0-9/_-]/g, '-').replace(/\//g, '-')
}

function getLogGroup() {
  return process.env.CLOUDWATCH_LOG_GROUP || '/easerent/api'
}

function getStreamName(context) {
  const prefix = process.env.CLOUDWATCH_LOG_STREAM_PREFIX || 'vercel'
  const safeRoute = sanitizeRoute(context?.route || 'api')
  const requestId = String(context?.requestId || `req-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${prefix}-${safeRoute}-${requestId}`.slice(0, 512)
}

async function ensureStream(client, logGroupName, logStreamName) {
  const key = `${logGroupName}::${logStreamName}`
  const existing = streamState.get(key)
  if (existing?.initialized) return existing

  try {
    await client.send(new CreateLogStreamCommand({ logGroupName, logStreamName }))
  } catch (err) {
    if (err?.name !== 'ResourceAlreadyExistsException') {
      throw err
    }
  }

  const state = existing || {}
  state.initialized = true
  streamState.set(key, state)
  return state
}

export function createRequestContext(req, route) {
  const forwarded = req?.headers?.['x-forwarded-for']
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req?.socket?.remoteAddress || 'unknown').split(',')[0].trim()

  return {
    requestId:
      req?.headers?.['x-request-id'] ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    route,
    method: req?.method,
    ip,
  }
}

export async function logApiEvent(context, { level = 'INFO', event, meta = {} }) {
  try {
    const client = getClient()
    if (!client) return

    const logGroupName = getLogGroup()
    const logStreamName = getStreamName(context)
    const key = `${logGroupName}::${logStreamName}`

    const state = await ensureStream(client, logGroupName, logStreamName)
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId: context?.requestId,
      route: context?.route,
      method: context?.method,
      ip: context?.ip,
      meta: sanitizeValue(meta),
    }

    const input = {
      logGroupName,
      logStreamName,
      logEvents: [
        {
          timestamp: Date.now(),
          message: JSON.stringify(payload).slice(0, 250000),
        },
      ],
    }

    if (state?.nextSequenceToken) {
      input.sequenceToken = state.nextSequenceToken
    }

    const res = await client.send(new PutLogEventsCommand(input))
    streamState.set(key, {
      initialized: true,
      nextSequenceToken: res?.nextSequenceToken,
    })
  } catch (err) {
    // Never fail API routes due to observability failures.
    console.error('[CloudWatch] Failed to publish log event:', err?.message || err)
  }
}
