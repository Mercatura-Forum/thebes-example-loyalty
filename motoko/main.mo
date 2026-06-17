import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Admin "mo:thebes-lib/Admin";

// Loyalty / rewards program. The business (Admin owner/admins) issues points to
// members for purchases or actions; members redeem points for rewards. Built so
// the SPA gets a clean success value or a typed error: every guard/auth failure
// is a `Runtime.trap` (→ IC rollback), so there is no Result to decode.
//
// Correctness guards (the real ones):
//   1. POINTS CONSERVATION + NO NEGATIVE BALANCE. A balance is the running sum
//      of earns minus redeems; a redeem for more than the balance is rejected.
//      `verifyBalance` recomputes the balance from the immutable ledger so the UI
//      can prove stored == recomputed.
//   2. IMMUTABLE LEDGER. Every earn and redeem appends an entry that is never
//      edited or deleted — the audit trail of the program.
// Tier is derived from lifetime points earned (never spent down).
persistent actor Loyalty {

  var admin = Admin.init();

  public shared(msg) func claimOwner() : async Bool {
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("anonymous caller");
    Admin.claimOwner(admin, msg.caller)
  };
  public shared(msg) func transferOwner(n : Principal) : async Bool { Admin.transferOwner(admin, msg.caller, n) };
  public shared(msg) func addAdmin(w : Principal) : async Bool { Admin.addAdmin(admin, msg.caller, w) };
  public shared(msg) func removeAdmin(w : Principal) : async Bool { Admin.removeAdmin(admin, msg.caller, w) };
  public shared(msg) func setPaused(v : Bool) : async Bool { Admin.setPaused(admin, msg.caller, v) };
  public query func getOwner() : async ?Principal { Admin.getOwner(admin) };
  public query func isPaused() : async Bool { Admin.isPaused(admin) };

  type Member = { balance : Nat; lifetimeEarned : Nat };
  type Reward = { id : Nat; name : Text; costPoints : Nat; photoPath : ?Text; available : Bool };
  type Entry = { id : Nat; member : Principal; kind : Text; points : Nat; memo : Text; at : Int };

  var nextRewardId : Nat = 0;
  var nextEntryId : Nat = 0;
  let members = Map.empty<Principal, Member>();
  let rewards = Map.empty<Nat, Reward>();
  let ledger = Map.empty<Nat, Entry>();

  func memberOf(p : Principal) : Member {
    switch (Map.get(members, Principal.compare, p)) { case (?m) m; case null { { balance = 0; lifetimeEarned = 0 } } };
  };
  func tierOf(lifetime : Nat) : Text {
    if (lifetime >= 1000) "gold" else if (lifetime >= 250) "silver" else "bronze";
  };
  func append(member : Principal, kind : Text, points : Nat, memo : Text) {
    let id = nextEntryId;
    nextEntryId += 1;
    Map.add(ledger, Nat.compare, id, { id; member; kind; points; memo; at = Time.now() });
  };

  // No-auth cores: shared by the admin-gated public methods and by seedDemo
  // (which bypasses the gate only on an empty just-deployed program).
  func issuePointsRaw(member : Principal, points : Nat, memo : Text) {
    let m = memberOf(member);
    Map.add(members, Principal.compare, member, { balance = m.balance + points; lifetimeEarned = m.lifetimeEarned + points });
    append(member, "earn", points, memo);
  };
  func addRewardRaw(name : Text, costPoints : Nat, photoPath : ?Text) : Nat {
    let id = nextRewardId;
    nextRewardId += 1;
    Map.add(rewards, Nat.compare, id, { id; name; costPoints; photoPath; available = true });
    id;
  };

  // Business (admin): award points to a member. Traps if caller isn't an admin.
  public shared(msg) func issuePoints(member : Principal, points : Nat, memo : Text) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    if (points == 0) Runtime.trap("points must be > 0");
    issuePointsRaw(member, points, memo);
  };

  // Admin: define a reward.
  public shared(msg) func addReward(name : Text, costPoints : Nat, photoPath : ?Text) : async Nat {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    addRewardRaw(name, costPoints, photoPath);
  };

  // Seed a demo catalog of rewards (global, if empty) and give the caller a
  // starter balance + history (per-caller, only if brand-new). Bypasses the
  // admin gate so a just-deployed program is alive for the first signed-in visitor.
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to load demo data");
    var changed = false;
    if (Map.size(rewards) == 0) {
      ignore addRewardRaw("Free Coffee", 100, null);
      ignore addRewardRaw("$10 Voucher", 500, null);
      ignore addRewardRaw("Branded Tote Bag", 800, null);
      ignore addRewardRaw("VIP Event Pass", 1500, null);
      changed := true;
    };
    let m = memberOf(msg.caller);
    if (m.lifetimeEarned == 0) {
      issuePointsRaw(msg.caller, 350, "Welcome bonus");
      issuePointsRaw(msg.caller, 120, "In-store purchase");
      changed := true;
    };
    changed;
  };

  public shared(msg) func setRewardAvailable(rewardId : Nat, available : Bool) : async () {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    switch (Map.get(rewards, Nat.compare, rewardId)) {
      case null { Runtime.trap("reward not found") };
      case (?r) { Map.add(rewards, Nat.compare, rewardId, { r with available }) };
    };
  };

  // Member: redeem a reward. GUARD: balance must cover the cost (no negative
  // balance); the deduction + ledger entry happen in one synchronous call.
  // Returns the ledger entry id, or traps with the reason.
  public shared(msg) func redeem(rewardId : Nat) : async Nat {
    Admin.requireNotPaused(admin);
    let reward = switch (Map.get(rewards, Nat.compare, rewardId)) { case (?r) r; case null { Runtime.trap("reward not found") } };
    if (not reward.available) Runtime.trap("reward unavailable");
    let m = memberOf(msg.caller);
    if (m.balance < reward.costPoints) Runtime.trap("insufficient points");
    Map.add(members, Principal.compare, msg.caller, { m with balance = m.balance - reward.costPoints });
    let entryId = nextEntryId;
    append(msg.caller, "redeem", reward.costPoints, reward.name);
    entryId;
  };

  // ── Frontend views (flat) ──
  public shared query(msg) func myAccountView() : async [{ balance : Nat; lifetimeEarned : Nat; tier : Text }] {
    let m = memberOf(msg.caller);
    [{ balance = m.balance; lifetimeEarned = m.lifetimeEarned; tier = tierOf(m.lifetimeEarned) }]
  };

  public query func rewardsView() : async [{ id : Nat; name : Text; costPoints : Nat; available : Bool; photoPath : Text }] {
    Array.map<Reward, { id : Nat; name : Text; costPoints : Nat; available : Bool; photoPath : Text }>(
      Map.toArray<Nat, Reward>(rewards) |> Array.map<(Nat, Reward), Reward>(_, func((_, r)) { r }),
      func(r) { { id = r.id; name = r.name; costPoints = r.costPoints; available = r.available; photoPath = (switch (r.photoPath) { case (?p) p; case null "" }) } },
    )
  };

  public shared query(msg) func myHistoryView() : async [{ id : Nat; kind : Text; points : Nat; memo : Text; at : Int }] {
    let mine = Array.filter(Map.toArray<Nat, Entry>(ledger), func((_, e) : (Nat, Entry)) : Bool { Principal.equal(e.member, msg.caller) });
    let sorted = Array.sort(mine, func((_, a) : (Nat, Entry), (_, b) : (Nat, Entry)) : { #less; #equal; #greater } { Int.compare(b.at, a.at) });
    Array.map<(Nat, Entry), { id : Nat; kind : Text; points : Nat; memo : Text; at : Int }>(sorted, func((_, e)) { { id = e.id; kind = e.kind; points = e.points; memo = e.memo; at = e.at } })
  };

  // Integrity oracle: balance == Σ earns − Σ redeems over the caller's ledger.
  public shared query(msg) func verifyBalanceView() : async [{ stored : Int; recomputed : Int; consistent : Bool }] {
    let m = memberOf(msg.caller);
    var sum : Int = 0;
    for ((_, e) in Map.entries(ledger)) {
      if (Principal.equal(e.member, msg.caller)) { sum += (if (e.kind == "earn") e.points else -e.points) };
    };
    [{ stored = m.balance; recomputed = sum; consistent = (sum == m.balance) }]
  };
}
