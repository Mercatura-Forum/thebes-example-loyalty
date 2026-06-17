import { NavLink, Outlet } from 'react-router-dom'
import { SignOutChip } from '@thebes/sdk'

const tabs = [
  { to: '/', label: 'My card', end: true },
  { to: '/history', label: 'History' },
  { to: '/admin', label: 'Admin' },
]

export function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <NavLink to="/" className="font-display text-2xl font-extrabold tracking-tight">
            carat<span className="text-[var(--color-gold)]">◆</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-[var(--color-gold)]/12 text-[var(--color-gold-ink)]' : 'text-ink-soft hover:text-ink'}`}>
                {t.label}
              </NavLink>
            ))}
            <SignOutChip className="ml-2 border-l border-[var(--color-line)] pl-3" />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8"><Outlet /></main>
      <footer className="mx-auto max-w-4xl px-5 py-8 text-xs text-ink-soft">
        An on-chain rewards program — your points, tier, and every earn/redeem
        live on the chain. Points can't go negative; the ledger is immutable.
      </footer>
    </div>
  )
}
