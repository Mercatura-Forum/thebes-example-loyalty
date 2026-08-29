# thebes-example-loyalty

An on-chain loyalty program built on [Thebes Protocol](https://thebesprotocol.com):
a Motoko backend that holds member cards, point balances, a stocked reward
catalog, and an immutable ledger, and a React frontend served as certified assets.

The property this example proves: **points that are conserved, tiers that pay
honestly, shelves that reconcile.** Balances can never go negative; tiers
multiply earnings at earn time with the bonus written as its own ledger entry
(auditable per entry, never retroactive); reward stock decrements atomically
with each redemption; and the **public oracle** (`invariantReportView`) plus
the circulation seal (earned = in circulation + redeemed) re-prove it all on
every read.

Live demo: <https://memphis.mercaturaforum.com/_/raw/173835690051930/index.html>

## Architecture

```
frontend (React + Vite + Tailwind)   →   loyalty backend (Motoko)
   @thebes/sdk  ── boundary client       mo:thebes-lib ── Admin
   Memphis passkey gate                  cards · points · rewards · history
```

- **frontend/** uses `@thebes/sdk` for the boundary client, typed query/update
  calls, React hooks, and the Memphis passkey gate. The SDK is **vendored** under
  `frontend/vendor/@thebes/sdk` and resolved as a local dependency
  (upstream source of truth: [`thebes-sdk`](https://github.com/Mercatura-Forum/thebes-sdk)).
- **motoko/** uses `thebes-lib` for `Admin` (controller-gated operations); the
  loyalty logic lives in `main.mo`. The library is **vendored** under
  `motoko/thebes-lib` and resolved as a local Mops dependency.

Both halves are self-contained: the repository builds with no external Git or Mops
toolkit pins. The frontend asset-canister wasm is the one artifact fetched at
deploy time (see [Deploy](#deploy)).

## Backend interface (selected)

| Method | Kind | Purpose |
| --- | --- | --- |
| `rewardsView` | query | Browse the reward catalog. |
| `myAccountView` | query | The caller's balance, lifetime points, and tier. |
| `myHistoryView` | query | The caller's transaction ledger. |
| `verifyBalanceView` | query | Self-check: stored balance vs. recomputed-from-ledger. |
| `seedDemo` | update | Populate demo rewards and a starter balance for a new member. |
| `issuePoints` | update | Award points to a member (admin); traps on a failed guard. |
| `addReward` / `setRewardAvailable` | update | Reward catalog management (admin). |
| `redeem` | update | Spend points on a reward; traps on insufficient balance so the client never silently ignores an error. |
| `claimOwner` / `addAdmin` / `setPaused` | update | Ownership and admin surface (from `thebes-lib`'s `Admin`). |

## Toolchain

- **Motoko compiler 1.4.1.** `mops install` fetches the pinned compiler to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Use that binary — the `moc` on a default `PATH` may be a different version, or
  Qt's unrelated Meta-Object Compiler.
- **Node 18+** and **[Mops](https://mops.one)** for the two builds.
- **[`thebes-deploy`](https://github.com/Mercatura-Forum/Thebes-Protocol-/releases)**
  to deploy. The prebuilt binary is Linux x86-64; on other platforms build it from
  the release source bundle (`cargo build --release -p thebes-deploy`).

## Run locally

```sh
# Frontend
cd frontend
npm install            # resolves the vendored @thebes/sdk
npm run dev            # sync-sdk copies the browser runtimes into public/, then Vite serves

# Backend (compile-check)
cd ../motoko
mops install           # resolves the vendored thebes-lib + the pinned compiler
"$(ls "$HOME/.cache/mops/moc/1.4.1/moc" "$HOME/Library/Caches/mops/moc/1.4.1/moc" 2>/dev/null | head -1)" --check $(mops sources) main.mo
```

## Deploy

`thebes.toml` describes the deploy. Its `[networks.wan].validators` are pre-filled
with the current WAN cluster endpoints; run `thebes-deploy init` to re-print them.

> **Deploying your own copy?** The committed `cid` values pin the **live catalog
> deployment** (that's what the demo links serve — only its controller can
> upgrade it). Before your first deploy, set `cid = "auto"` on each canister:
> the deploy allocates fresh canisters you control and writes their ids back
> into the manifest.

### 1. Backend

```sh
thebes-deploy identity new me      # one-time local signing identity
thebes-deploy deploy loyalty       # build + install + verify → prints the backend cid
```

### 2. Frontend

The frontend installs an asset canister, then uploads your built bundle. Fetch the
asset-canister wasm once (it is referenced by `thebes.toml` as `asset_canister.wasm`):

```sh
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
```

Build the bundle and point it at your backend cid (the frontend reads
`window.LOYALTY_CID` at runtime), then deploy:

```sh
cd frontend && npm run build && cd ..
# inject the backend cid from step 1 into the built page:
sed -i 's#<head>#<head><script>window.LOYALTY_CID=YOUR_LOYALTY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web           # install asset canister + upload bundle + verify
```

The deploy prints the live URL:
`https://memphis.mercaturaforum.com/_/raw/<web-cid>/index.html`.

> Reward photos are served by a separate media canister via `window.MEDIA_CID`.
> It is optional — without one, rewards render without images.

For a machine-readable deploy contract, see [AGENTS.md](AGENTS.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
