const protectedPaths = new Set(['/dashboard', '/plans', '/subscriptions', '/recovery', '/analytics', '/settings'])

export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  const path = value.split(/[?#]/, 1)[0]
  return protectedPaths.has(path) ? value : null
}
