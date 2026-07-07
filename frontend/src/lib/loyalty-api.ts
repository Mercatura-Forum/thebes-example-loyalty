/** loyalty-api.ts — typed reads/writes for the loyalty backend (trap-on-error). */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat } from '@thebes/sdk'
import { LOYALTY_CID } from './config'
import { calibrate } from './chainTime'

export interface Account { balance: bigint; lifetimeEarned: bigint; tier: string; multBps: bigint; nextTierAt: bigint; nowNs: bigint }
export interface Reward { id: bigint; name: string; costPoints: bigint; available: boolean; photoPath: string; stock: bigint; initialStock: bigint }
export interface SealRow { members: bigint; circulation: bigint; totalEarned: bigint; totalRedeemed: bigint; rewardsRedeemed: bigint; violations: bigint; checkedAt: bigint }
export interface LeaderRow { member: string; lifetimeEarned: bigint; tier: string }
export interface ViolationRow { rule: string; detail: string }
export interface Entry { id: bigint; kind: string; points: bigint; memo: string; at: bigint }
export interface BalanceCheck { stored: bigint; recomputed: bigint; consistent: boolean }

const ACCOUNT_FIELDS = [
  { name: 'balance', type: 'nat' as const }, { name: 'lifetimeEarned', type: 'nat' as const }, { name: 'tier', type: 'text' as const },
  { name: 'multBps', type: 'nat' as const }, { name: 'nextTierAt', type: 'nat' as const }, { name: 'nowNs', type: 'int' as const },
]
const SEAL_FIELDS = [
  { name: 'members', type: 'nat' as const }, { name: 'circulation', type: 'nat' as const },
  { name: 'totalEarned', type: 'nat' as const }, { name: 'totalRedeemed', type: 'nat' as const },
  { name: 'rewardsRedeemed', type: 'nat' as const }, { name: 'violations', type: 'nat' as const },
  { name: 'checkedAt', type: 'int' as const },
]
const LEADER_FIELDS = [
  { name: 'member', type: 'principal' as const }, { name: 'lifetimeEarned', type: 'nat' as const }, { name: 'tier', type: 'text' as const },
]
const VIOLATION_FIELDS = [{ name: 'rule', type: 'text' as const }, { name: 'detail', type: 'text' as const }]
const REWARD_FIELDS = [
  { name: 'id', type: 'nat' as const }, { name: 'name', type: 'text' as const },
  { name: 'costPoints', type: 'nat' as const }, { name: 'available', type: 'bool' as const }, { name: 'photoPath', type: 'text' as const },
  { name: 'stock', type: 'nat' as const }, { name: 'initialStock', type: 'nat' as const },
]
const ENTRY_FIELDS = [
  { name: 'id', type: 'nat' as const }, { name: 'kind', type: 'text' as const },
  { name: 'points', type: 'nat' as const }, { name: 'memo', type: 'text' as const }, { name: 'at', type: 'int' as const },
]
const CHECK_FIELDS = [
  { name: 'stored', type: 'int' as const }, { name: 'recomputed', type: 'int' as const }, { name: 'consistent', type: 'bool' as const },
]

export const decodeAccount = (h: string) => {
  const rows = decodeVecRecord(h, ACCOUNT_FIELDS) as unknown as Account[]
  if (rows.length > 0) calibrate(rows[0].nowNs)
  return rows[0]
}
export const decodeSeal = (h: string) => {
  const rows = decodeVecRecord(h, SEAL_FIELDS) as unknown as SealRow[]
  if (rows.length > 0) calibrate(rows[0].checkedAt)
  return rows[0]
}
export const decodeLeaders = (h: string) => decodeVecRecord(h, LEADER_FIELDS) as unknown as LeaderRow[]
export const decodeViolations = (h: string) => decodeVecRecord(h, VIOLATION_FIELDS) as unknown as ViolationRow[]
export const decodeRewards = (h: string) => decodeVecRecord(h, REWARD_FIELDS) as unknown as Reward[]
export const decodeHistory = (h: string) => decodeVecRecord(h, ENTRY_FIELDS) as unknown as Entry[]
export const decodeCheck = (h: string) => (decodeVecRecord(h, CHECK_FIELDS) as unknown as BalanceCheck[])[0]

export const M = {
  account: 'myAccountView', rewards: 'rewardsView', history: 'myHistoryView', check: 'verifyBalanceView',
  seal: 'programSealView', invariants: 'invariantReportView', leaders: 'leaderboardView',
} as const

export const leadersArgs = (limit: number) => encodeArg({ type: 'nat', value: BigInt(limit) })

/** One-shot chain-clock calibration (the seal carries checkedAt). */
export async function calibrateChainClock(): Promise<void> {
  const r = await query(LOYALTY_CID, 'programSealView')
  decodeSeal(r.reply_hex ?? r.reply ?? '')
}

// ── Writes (trap-on-error → throws with the reason) ──
export async function redeem(rewardId: bigint): Promise<void> { await update(LOYALTY_CID, 'redeem', encodeArg({ type: 'nat', value: rewardId })) }
export async function claimOwner(): Promise<void> { await update(LOYALTY_CID, 'claimOwner') }
export async function issuePoints(member: string, points: bigint, memo: string): Promise<void> {
  await update(LOYALTY_CID, 'issuePoints', encodeArgs([
    { type: 'principal', value: member }, { type: 'nat', value: points }, { type: 'text', value: memo },
  ]))
}
export async function addReward(name: string, costPoints: bigint, photoPath: string | null, stock: bigint): Promise<bigint> {
  const r = await update(LOYALTY_CID, 'addReward', encodeArgs([
    { type: 'text', value: name }, { type: 'nat', value: costPoints }, { type: 'opt', inner: { type: 'text' }, value: photoPath },
    { type: 'nat', value: stock },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}

/** Seed demo rewards (if empty) + a starter balance for the caller (if new). */
export async function seedDemo(): Promise<void> { await update(LOYALTY_CID, 'seedDemo') }

export { query, LOYALTY_CID }
