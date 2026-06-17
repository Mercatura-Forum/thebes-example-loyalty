import { useQuery } from '@thebes/sdk'
import { LOYALTY_CID, M, decodeHistory, decodeCheck, type Entry, type BalanceCheck } from '../lib/loyalty-api'
import { relTime } from '../lib/config'
import { Spinner, EmptyState, ErrorNote } from '../components/ui'

export function History() {
  const hist = useQuery<Entry[]>(LOYALTY_CID, M.history, undefined, decodeHistory)
  const check = useQuery<BalanceCheck | undefined>(LOYALTY_CID, M.check, undefined, decodeCheck)
  if (hist.loading) return <Spinner label="Loading history" />
  if (hist.error) return <ErrorNote message={hist.error} />
  const entries = hist.data ?? []
  const consistent = check.data?.consistent ?? true

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Points history</h1>
        <span className={`text-xs ${consistent ? 'text-emerald-600' : 'text-red-600'}`}>
          {consistent ? '✓ balance verified against the ledger' : '⚠ balance mismatch'}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="mt-5"><EmptyState title="No activity yet" hint="Earned and redeemed points appear here — an immutable record." /></div>
      ) : (
        <ul className="mt-5 card divide-y divide-[var(--color-line)]">
          {entries.map((e) => {
            const earn = e.kind === 'earn'
            return (
              <li key={e.id.toString()} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium capitalize">{e.kind === 'earn' ? 'Earned' : 'Redeemed'}{e.memo ? ` · ${e.memo}` : ''}</p>
                  <p className="text-xs text-ink-soft">{relTime(e.at)}</p>
                </div>
                <span className={`font-display font-bold nums ${earn ? 'text-emerald-600' : 'text-[var(--color-gold-ink)]'}`}>
                  {earn ? '+' : '−'}{e.points.toString()}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
