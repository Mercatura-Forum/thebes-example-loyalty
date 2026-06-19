# AGENTS.md — deploying this example

A canonical, copy-pasteable contract for an automated agent deploying
`thebes-example-loyalty` to a Thebes cluster. Human-readable detail is in
[README.md](README.md).

## Layout

```
thebes.toml                 deploy manifest (network + canisters)
motoko/main.mo              backend (Motoko); imports mo:thebes-lib/Admin
motoko/thebes-lib/          vendored backend library (local Mops dep — no external pin)
frontend/                   React + Vite app on @thebes/sdk
frontend/vendor/@thebes/sdk vendored SDK (local file: dep — no external pin)
```

## Toolchain (exact)

- Motoko compiler **1.4.1**, fetched by `mops install` to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Do **not** invoke a bare `moc` — a default `PATH` may resolve a different
  compiler version or Qt's Meta-Object Compiler.
- Node 18+, Mops, and the `thebes-deploy` CLI (Linux x86-64 prebuilt; build from
  the release source bundle on other platforms).
- `mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned.
  This is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

```sh
# 0. network: the thebes.toml [networks.wan].validators are pre-filled with the
#    current WAN cluster endpoints. To re-print them:
thebes-deploy init            # prints current WAN cluster validators

# 1. backend
thebes-deploy identity new me
thebes-deploy deploy loyalty  # → prints the backend cid (call it LOYALTY_CID)

# 2. frontend
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
cd frontend && npm install && npm run build && cd ..
sed -i 's#<head>#<head><script>window.LOYALTY_CID=LOYALTY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web      # → prints https://memphis.mercaturaforum.com/_/raw/<cid>/index.html
```

Verify: `curl -s -o /dev/null -w '%{http_code}' <printed-url>` returns `200`.

## Calling the backend

```sh
thebes-deploy query loyalty rewardsView                   # queries need no identity
thebes-deploy call  loyalty seedDemo                       # updates need a local identity
```

Candid arguments use textual form and are passed with `--arg`, e.g.
`thebes-deploy call loyalty issuePoints --arg '(principal "…", 100 : nat, "welcome")'`.

Public methods exposed by `motoko/main.mo`:

| Method | Kind | Signature |
| --- | --- | --- |
| `claimOwner` | update | `()` |
| `transferOwner` | update | `(Principal)` |
| `addAdmin` / `removeAdmin` | update | `(Principal)` |
| `setPaused` | update | `(Bool)` |
| `getOwner` | query | `()` |
| `isPaused` | query | `()` |
| `issuePoints` | update | `(member : Principal, points : Nat, memo : Text)` |
| `addReward` | update | `(name : Text, costPoints : Nat, photoPath : ?Text)` |
| `seedDemo` | update | `()` |
| `setRewardAvailable` | update | `(rewardId : Nat, available : Bool)` |
| `redeem` | update | `(rewardId : Nat)` |
| `myAccountView` | query | `()` |
| `rewardsView` | query | `()` |
| `myHistoryView` | query | `()` |
| `verifyBalanceView` | query | `()` |

## Conventions that affect correctness

- **`window.LOYALTY_CID`** (and optional `window.MEDIA_CID`) are injected into the
  built page at deploy time; the frontend reads them at runtime. If you skip the
  injection step, the page falls back to compiled-in defaults and talks to the
  wrong backend.
- **Boundary decoding** returns a `vec record` of scalar fields. A single record is
  a 0-or-1-element array (e.g. `myAccountView` returns a 0-or-1-element array);
  principal fields are 56-character hex. Decode with the SDK's `decodeVecRecord` /
  `decodeNat` / `decodeBool`.
- Guarded writes (`issuePoints`, `addReward`, `redeem`) trap on a failed guard so
  the client sees a rejection instead of a silently-swallowed error.
