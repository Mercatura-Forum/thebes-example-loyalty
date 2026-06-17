import { useRef, useState } from 'react'
import { useQuery, useUpdate, useMediaUpload } from '@thebes/sdk'
import { identity } from '@thebes/sdk'
import { LOYALTY_CID, M, decodeRewards, issuePoints, addReward, type Reward } from '../lib/loyalty-api'
import { MEDIA_CID } from '../lib/config'
import { MediaImage } from '../components/MediaImage'
import { Button, Spinner, ErrorNote } from '../components/ui'

export function Admin() {
  const rewards = useQuery<Reward[]>(LOYALTY_CID, M.rewards, undefined, decodeRewards)
  const { call } = useUpdate()
  const media = useMediaUpload(MEDIA_CID)
  const fileRef = useRef<HTMLInputElement>(null)

  const [member, setMember] = useState('')
  const [points, setPoints] = useState('')
  const [memo, setMemo] = useState('')
  const [rname, setRname] = useState('')
  const [cost, setCost] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [note, setNote] = useState<string>()
  const [err, setErr] = useState<string>()

  async function award() {
    setErr(undefined); setNote(undefined)
    try {
      await issuePoints((member.trim() || identity()), BigInt(points || '0'), memo.trim() || 'reward')
      setNote('Points issued'); setPoints(''); setMemo(''); rewards.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try { setPhotoPath((await media.upload(file, 'photo')).path) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function createReward() {
    setErr(undefined); setNote(undefined)
    try {
      await addReward(rname.trim() || 'Reward', BigInt(cost || '0'), photoPath)
      setRname(''); setCost(''); setPhotoPath(null); if (fileRef.current) fileRef.current.value = ''
      setNote('Reward added'); rewards.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-6">
        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Program owner</h2>
          <Button variant="ghost" className="mt-3" onClick={() => call(LOYALTY_CID, 'claimOwner').then(() => setNote('Ownership claimed')).catch((e) => setErr(String(e)))}>Claim ownership</Button>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Issue points</h2>
          <p className="mt-1 text-xs text-ink-soft">Award points to a member's principal (blank = yourself, for a quick demo).</p>
          <div className="mt-3 space-y-2">
            <input className={inp} placeholder="member principal (optional)" value={member} onChange={(e) => setMember(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={`${inp} nums`} inputMode="numeric" placeholder="points" value={points} onChange={(e) => setPoints(e.target.value)} />
              <input className={inp} placeholder="memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
          <Button className="mt-3 w-full" onClick={award} disabled={!points}>Issue points</Button>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Add a reward</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--color-line)]"><MediaImage path={photoPath ?? ''} alt="Reward" ratio="3 / 2" /></div>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])}
              className="block text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-gold)] file:px-3 file:py-1.5 file:text-white" />
          </div>
          {media.busy && <p className="mt-2 text-xs text-ink-soft nums">Uploading… {Math.round(media.progress * 100)}%</p>}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input className={inp} placeholder="Reward name" value={rname} onChange={(e) => setRname(e.target.value)} />
            <input className={`${inp} w-28 nums`} inputMode="numeric" placeholder="cost pts" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <Button className="mt-3 w-full" onClick={createReward} disabled={!rname.trim() || !cost}>Add reward</Button>
        </div>

        {note && <p className="text-sm text-[var(--color-gold-ink)]">{note}</p>}
        {err && <ErrorNote message={err} />}
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Rewards</h2>
        {rewards.loading ? <div className="mt-4"><Spinner /></div> : (
          <ul className="mt-4 space-y-2">
            {(rewards.data ?? []).map((r) => (
              <li key={r.id.toString()} className="card flex items-center gap-3 p-3">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg"><MediaImage path={r.photoPath} alt={r.name} ratio="3 / 2" /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p><p className="text-xs text-ink-soft nums">{r.costPoints.toString()} pts</p></div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.available ? 'bg-emerald-500/10 text-emerald-700' : 'bg-[var(--color-ink)]/8 text-ink-soft'}`}>{r.available ? 'Live' : 'Off'}</span>
              </li>
            ))}
            {rewards.data?.length === 0 && <p className="text-sm text-ink-soft">No rewards yet.</p>}
          </ul>
        )}
      </section>
    </div>
  )
}

const inp = 'w-full rounded-lg border border-[var(--color-line)] bg-paper px-3 py-2 text-sm'
