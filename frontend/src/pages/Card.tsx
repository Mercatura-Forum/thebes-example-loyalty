import { useRef, useState } from 'react'
import { useQuery, identity } from '@thebes/sdk'
import { nextTier } from '../lib/config'
import {
  LOYALTY_CID, M, decodeAccount, decodeRewards, decodeLeaders, leadersArgs,
  redeem, seedDemo, type Account, type Reward, type LeaderRow,
} from '../lib/loyalty-api'
import { MediaImage } from '../components/MediaImage'
import { Ring, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function Card() {
  const acct = useQuery<Account | undefined>(LOYALTY_CID, M.account, undefined, decodeAccount)
  const rewards = useQuery<Reward[]>(LOYALTY_CID, M.rewards, undefined, decodeRewards)
  const leaders = useQuery<LeaderRow[]>(LOYALTY_CID, M.leaders, leadersArgs(5), decodeLeaders)
  const [busy, setBusy] = useState<bigint>()
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string>()
  const cardRef = useRef<HTMLDivElement>(null)

  async function seed() {
    setSeeding(true); setErr(undefined)
    try { await seedDemo(); acct.refetch(); rewards.refetch(); leaders.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  if (acct.loading) return <Spinner label="Loading your card" />
  if (acct.error) return <ErrorNote message={acct.error} />
  const a = acct.data ?? { balance: 0n, lifetimeEarned: 0n, tier: 'bronze', multBps: 10000n, nextTierAt: 250n, nowNs: 0n }
  const lifetime = Number(a.lifetimeEarned)
  const next = nextTier(lifetime)
  const pct = next ? lifetime / next.at : 1
  const mult = (Number(a.multBps) / 10000).toFixed(2).replace(/\.?0+$/, '')

  async function doRedeem(r: Reward) {
    setBusy(r.id); setErr(undefined)
    try { await redeem(r.id); acct.refetch(); rewards.refetch(); leaders.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }

  // The tilt: the card leans toward the cursor, the foil sheen follows it.
  function onMove(e: React.MouseEvent) {
    const el = cardRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`
    el.style.setProperty('--foil-x', `${(x + 0.5) * 100}%`)
  }
  function onLeave() {
    const el = cardRef.current
    if (el) el.style.transform = 'perspective(900px)'
  }

  return (
    <div className="space-y-8">
      {/* The membership card — the signature element, in foil. */}
      <div style={{ perspective: '900px' }}>
        <section ref={cardRef} onMouseMove={onMove} onMouseLeave={onLeave}
          className="member-card foil relative p-6 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]"
          data-testid="member-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Carat rewards</p>
              <p className="font-display mt-3 text-5xl font-extrabold nums">{a.balance.toString()}<span className="ml-2 text-base font-medium text-amber-200/70">pts</span></p>
              <p className="mt-2 text-sm capitalize text-amber-100/80">
                <span className="font-bold" style={{ color: `var(--tier-${a.tier})` }}>{a.tier}</span> member
                <span className="ml-2 rounded-full bg-amber-200/15 px-2 py-0.5 text-[11px] font-bold text-amber-200" data-testid="mult-chip">earning {mult}×</span>
              </p>
              <p className="mt-1 text-xs text-amber-100/60 nums">
                {next ? `${next.at - lifetime} pts to ${next.name}` : 'top tier'}
              </p>
              <p className="mt-4 font-mono text-[11px] text-amber-200/40">{identity().slice(0, 8)}…{identity().slice(-4)}</p>
            </div>
            <Ring pct={pct} size={84} label={next ? `${Math.round(pct * 100)}%` : '★'} />
          </div>
        </section>
      </div>

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
              const out = Number(r.stock) === 0
              const low = !out && Number(r.stock) <= 3
              return (
                <div key={r.id.toString()} className={`card overflow-hidden ${out ? 'opacity-60' : ''}`}>
                  <MediaImage path={r.photoPath} alt={r.name} ratio="3 / 2" />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-semibold">{r.name}</p>
                      {low && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 nums">only {r.stock.toString()} left</span>}
                      {out && <span className="rounded-full bg-stone-500/15 px-2 py-0.5 text-[10px] font-bold text-stone-500">out of stock</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-soft nums">{r.costPoints.toString()} pts · {r.stock.toString()}/{r.initialStock.toString()} on the shelf</p>
                    <Button className="mt-3 w-full" disabled={!afford || out || busy === r.id} onClick={() => doRedeem(r)}>
                      {busy === r.id ? 'Redeeming…' : out ? 'Out of stock' : afford ? 'Redeem' : 'Not enough points'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {(leaders.data ?? []).length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">Leaderboard</h2>
          <ol className="mt-3 space-y-1.5">
            {(leaders.data ?? []).map((l, i) => (
              <li key={l.member} className="card flex items-center gap-3 px-4 py-2.5">
                <span className={`font-display w-6 text-lg font-extrabold nums ${i === 0 ? 'text-[var(--color-gold)]' : 'text-ink-soft'}`}>{i + 1}</span>
                <span className="font-mono text-xs text-ink-soft">{l.member.slice(0, 10)}…{l.member === identity() && <b className="ml-1 text-[var(--color-gold-ink)]">you</b>}</span>
                <span className="ml-auto text-sm font-semibold nums">{l.lifetimeEarned.toString()} pts</span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: `var(--tier-${l.tier})`, background: `color-mix(in oklab, var(--tier-${l.tier}) 12%, transparent)` }}>{l.tier}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
