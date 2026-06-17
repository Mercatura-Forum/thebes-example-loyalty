import { useState } from 'react'
import { useQuery } from '@thebes/sdk'
import { identity } from '@thebes/sdk'
import { nextTier } from '../lib/config'
import { LOYALTY_CID, M, decodeAccount, decodeRewards, redeem, seedDemo, type Account, type Reward } from '../lib/loyalty-api'
import { MediaImage } from '../components/MediaImage'
import { Ring, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function Card() {
  const acct = useQuery<Account | undefined>(LOYALTY_CID, M.account, undefined, decodeAccount)
  const rewards = useQuery<Reward[]>(LOYALTY_CID, M.rewards, undefined, decodeRewards)
  const [busy, setBusy] = useState<bigint>()
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string>()

  async function seed() {
    setSeeding(true); setErr(undefined)
    try { await seedDemo(); acct.refetch(); rewards.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  if (acct.loading) return <Spinner label="Loading your card" />
  if (acct.error) return <ErrorNote message={acct.error} />
  const a = acct.data ?? { balance: 0n, lifetimeEarned: 0n, tier: 'bronze' }
  const lifetime = Number(a.lifetimeEarned)
  const next = nextTier(lifetime)
  const pct = next ? lifetime / next.at : 1

  async function doRedeem(r: Reward) {
    setBusy(r.id); setErr(undefined)
    try { await redeem(r.id); acct.refetch(); rewards.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }

  return (
    <div className="space-y-8">
      {/* The membership card — the signature element. */}
      <section className="member-card p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Carat rewards</p>
            <p className="font-display mt-3 text-5xl font-extrabold nums">{a.balance.toString()}<span className="ml-2 text-base font-medium text-amber-200/70">pts</span></p>
            <p className="mt-2 text-sm capitalize text-amber-100/80">
              <span className="font-bold" style={{ color: `var(--tier-${a.tier})` }}>{a.tier}</span> member
              {next ? ` · ${next.at - lifetime} pts to ${next.name}` : ' · top tier'}
            </p>
            <p className="mt-4 font-mono text-[11px] text-amber-200/40">{identity().slice(0, 8)}…{identity().slice(-4)}</p>
          </div>
          <Ring pct={pct} size={84} label={next ? `${Math.round(pct * 100)}%` : '★'} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">Rewards</h2>
        {err && <div className="mt-3"><ErrorNote message={err} /></div>}
        {rewards.loading ? <div className="mt-4"><Spinner /></div> : (rewards.data ?? []).length === 0 ? (
          <div className="mt-4"><EmptyState
            title="No rewards yet"
            hint="Load a demo program to see your card come alive, or define rewards in Admin."
            action={<Button onClick={seed} disabled={seeding}>{seeding ? 'Loading…' : 'Load demo data'}</Button>}
          /></div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(rewards.data ?? []).filter((r) => r.available).map((r) => {
              const afford = a.balance >= r.costPoints
              return (
                <div key={r.id.toString()} className="card overflow-hidden">
                  <MediaImage path={r.photoPath} alt={r.name} ratio="3 / 2" />
                  <div className="p-4">
                    <p className="font-display font-semibold">{r.name}</p>
                    <p className="mt-0.5 text-sm text-ink-soft nums">{r.costPoints.toString()} pts</p>
                    <Button className="mt-3 w-full" disabled={!afford || busy === r.id} onClick={() => doRedeem(r)}>
                      {busy === r.id ? 'Redeeming…' : afford ? 'Redeem' : 'Not enough points'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
