/** Contract ids — injected at deploy; fallback 0 until then (loyalty.mo built, not deployed). */
declare global {
  interface Window {
    LOYALTY_CID?: number
    MEDIA_CID?: number
  }
}
export const LOYALTY_CID: number = (typeof window !== 'undefined' && window.LOYALTY_CID) || 0
export const MEDIA_CID: number = (typeof window !== 'undefined' && window.MEDIA_CID) || 0

export function relTime(ns: bigint): string {
  const ms = Number(ns / 1_000_000n)
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Next tier + its lifetime-points threshold (for the progress ring). */
export function nextTier(lifetime: number): { name: string; at: number } | null {
  if (lifetime < 250) return { name: 'silver', at: 250 }
  if (lifetime < 1000) return { name: 'gold', at: 1000 }
  return null
}
