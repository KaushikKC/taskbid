import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stop browsers from MIME-sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Restrict referrer info
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features we don't use
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // XSS protection for older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Only load resources over HTTPS in production
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig;
