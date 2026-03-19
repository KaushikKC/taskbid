/**
 * Simple in-memory sliding-window rate limiter.
 * Good enough for a single-process server; replace with Redis for multi-instance.
 */

type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

// Clean up expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

export type RateLimitResult =
  | { allowed: true;  remaining: number; resetAt: number }
  | { allowed: false; remaining: 0;     resetAt: number }

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt }
}

/** Extract client IP from Next.js request headers */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  )
}
