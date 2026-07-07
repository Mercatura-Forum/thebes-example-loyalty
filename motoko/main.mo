import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Array "mo:core/Array";
import List "mo:core/List";
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
  type Reward = { id : Nat; name : Text; costPoints : Nat; photoPath : ?Text; available : Bool; stock : Nat; initialStock : Nat };
  // kind: "earn" | "bonus" (tier multiplier) | "redeem" — the ledger is append-only.
  type Entry = { id : Nat; member : Principal; kind : Text; points : Nat; memo : Text; at : Int };

  // Tier earn multipliers, in basis points. The bonus is written as its OWN
  // ledger entry so the multiplier law is visible and auditable per entry.
  func tierBps(lifetime : Nat) : Nat {
    if (lifetime >= 1000) 15_000 else if (lifetime >= 250) 12_500 else 10_000;
  };

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
    // The tier bonus rides on the member's tier AT EARN TIME, and lands as a
    // separate "bonus" ledger entry — the multiplier is auditable per entry.
    let bonus = points * tierBps(m.lifetimeEarned) / 10_000 - points;
    Map.add(members, Principal.compare, member, {
      balance = m.balance + points + bonus;
      lifetimeEarned = m.lifetimeEarned + points + bonus;
    });
    append(member, "earn", points, memo);
    if (bonus > 0) append(member, "bonus", bonus, "tier bonus — " # tierOf(m.lifetimeEarned));
  };
  func addRewardRaw(name : Text, costPoints : Nat, photoPath : ?Text, stock : Nat) : Nat {
    let id = nextRewardId;
    nextRewardId += 1;
    Map.add(rewards, Nat.compare, id, { id; name; costPoints; photoPath; available = true; stock; initialStock = stock });
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
  public shared(msg) func addReward(name : Text, costPoints : Nat, photoPath : ?Text, stock : Nat) : async Nat {
    Admin.requireNotPaused(admin);
    Admin.requireAdmin(admin, msg.caller);
    if (stock == 0) Runtime.trap("a reward needs at least one unit of stock");
    addRewardRaw(name, costPoints, photoPath, stock);
  };

  // Seed a demo catalog of rewards (global, if empty) and give the caller a
  // starter balance + history (per-caller, only if brand-new). Bypasses the
  // admin gate so a just-deployed program is alive for the first signed-in visitor.
  public shared(msg) func seedDemo() : async Bool {
    Admin.requireNotPaused(admin);
    if (Principal.isAnonymous(msg.caller)) Runtime.trap("Sign in to load demo data");
    var changed = false;
    if (Map.size(rewards) == 0) {
      ignore addRewardRaw("Free Coffee", 100, null, 50);
      ignore addRewardRaw("$10 Voucher", 500, null, 20);
      ignore addRewardRaw("Branded Tote Bag", 800, null, 10);
      ignore addRewardRaw("VIP Event Pass", 1500, null, 3);
      changed := true;
    };
    let m = memberOf(msg.caller);
    if (m.lifetimeEarned == 0) {
      issuePointsRaw(msg.caller, 350, "Welcome bonus");          // bronze: 1.0x
      issuePointsRaw(msg.caller, 120, "In-store purchase");      // silver by now: 1.25x → +30 bonus
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
    if (reward.stock == 0) Runtime.trap("that reward is out of stock");
    let m = memberOf(msg.caller);
    if (m.balance < reward.costPoints) Runtime.trap("insufficient points");
    // Deduct, decrement stock and write the ledger entry in one synchronous
    // step — points and stock can never diverge from the ledger.
    Map.add(members, Principal.compare, msg.caller, { m with balance = m.balance - reward.costPoints });
    Map.add(rewards, Nat.compare, rewardId, { reward with stock = reward.stock - 1 });
    let entryId = nextEntryId;
    append(msg.caller, "redeem", reward.costPoints, reward.name);
    entryId;
  };

  // ── Frontend views (flat) ──
  public shared query(msg) func myAccountView() : async [{ balance : Nat; lifetimeEarned : Nat; tier : Text; multBps : Nat; nextTierAt : Nat; nowNs : Int }] {
    let m = memberOf(msg.caller);
    let next : Nat = if (m.lifetimeEarned >= 1000) 0 else if (m.lifetimeEarned >= 250) 1000 else 250;
    [{ balance = m.balance; lifetimeEarned = m.lifetimeEarned; tier = tierOf(m.lifetimeEarned); multBps = tierBps(m.lifetimeEarned); nextTierAt = next; nowNs = Time.now() }]
  };

  public query func rewardsView() : async [{ id : Nat; name : Text; costPoints : Nat; available : Bool; photoPath : Text; stock : Nat; initialStock : Nat }] {
    Array.map<Reward, { id : Nat; name : Text; costPoints : Nat; available : Bool; photoPath : Text; stock : Nat; initialStock : Nat }>(
      Map.toArray<Nat, Reward>(rewards) |> Array.map<(Nat, Reward), Reward>(_, func((_, r)) { r }),
      func(r) { { id = r.id; name = r.name; costPoints = r.costPoints; available = r.available; photoPath = (switch (r.photoPath) { case (?p) p; case null "" }); stock = r.stock; initialStock = r.initialStock } },
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

  // ── The oracle: three laws over the whole program, recomputable by anyone ──
  public query func invariantReportView() : async [{ rule : Text; detail : Text }] {
    let bad = List.empty<{ rule : Text; detail : Text }>();
    // Recompute every member's balance + lifetime from the append-only ledger.
    let earned = Map.empty<Principal, Nat>();
    let redeemed = Map.empty<Principal, Nat>();
    let redemptionsPerReward = Map.empty<Text, Nat>();
    for ((_, e) in Map.entries(ledger)) {
      if (e.kind == "redeem") {
        let prev = switch (Map.get(redeemed, Principal.compare, e.member)) { case (?x) x; case null 0 };
        Map.add(redeemed, Principal.compare, e.member, prev + e.points);
        let rc = switch (Map.get(redemptionsPerReward, Text.compare, e.memo)) { case (?x) x; case null 0 };
        Map.add(redemptionsPerReward, Text.compare, e.memo, rc + 1);
      } else {
        let prev = switch (Map.get(earned, Principal.compare, e.member)) { case (?x) x; case null 0 };
        Map.add(earned, Principal.compare, e.member, prev + e.points);
      };
    };
    for ((p, m) in Map.entries(members)) {
      let eSum = switch (Map.get(earned, Principal.compare, p)) { case (?x) x; case null 0 };
      let rSum = switch (Map.get(redeemed, Principal.compare, p)) { case (?x) x; case null 0 };
      // R1 balance conservation: balance == earned − redeemed, from the ledger.
      if (m.balance + rSum != eSum) {
        List.add(bad, { rule = "R1 balance"; detail = "a member's balance does not equal its ledger" });
      };
      // R2 lifetime: lifetimeEarned == every point ever earned; balance never exceeds it.
      if (m.lifetimeEarned != eSum) {
        List.add(bad, { rule = "R2 lifetime"; detail = "a member's lifetime total does not equal its earn ledger" });
      };
      if (m.balance > m.lifetimeEarned) {
        List.add(bad, { rule = "R2 lifetime"; detail = "a member's balance exceeds its lifetime earnings" });
      };
    };
    // R3 stock: what left the shelf equals what the ledger says was redeemed.
    for ((_, r) in Map.entries(rewards)) {
      let rc = switch (Map.get(redemptionsPerReward, Text.compare, r.name)) { case (?x) x; case null 0 };
      if (r.stock + rc != r.initialStock) {
        List.add(bad, { rule = "R3 stock"; detail = "reward \"" # r.name # "\" stock does not reconcile with its redemptions" });
      };
    };
    List.toArray(bad);
  };

  // One public row for the footer seal: circulation conservation.
  public query func programSealView() : async [{
    members : Nat; circulation : Nat; totalEarned : Nat; totalRedeemed : Nat;
    rewardsRedeemed : Nat; violations : Nat; checkedAt : Int;
  }] {
    var circ : Nat = 0;
    for ((_, m) in Map.entries(members)) { circ += m.balance };
    var earned : Nat = 0; var redeemedP : Nat = 0; var rCount : Nat = 0;
    for ((_, e) in Map.entries(ledger)) {
      if (e.kind == "redeem") { redeemedP += e.points; rCount += 1 } else { earned += e.points };
    };
    var v : Nat = 0;
    if (circ + redeemedP != earned) v += 1;
    for ((_, r) in Map.entries(rewards)) { if (r.stock > r.initialStock) v += 1 };
    [{ members = Map.size(members); circulation = circ; totalEarned = earned; totalRedeemed = redeemedP; rewardsRedeemed = rCount; violations = v; checkedAt = Time.now() }];
  };

  // Top members by lifetime points (principals are public in a leaderboard —
  // that is the point of one).
  public query func leaderboardView(limit : Nat) : async [{
    member : Principal; lifetimeEarned : Nat; tier : Text;
  }] {
    let all = Map.toArray(members);
    let sorted = Array.sort(all, func((_, a) : (Principal, Member), (_, b) : (Principal, Member)) : { #less; #equal; #greater } {
      Nat.compare(b.lifetimeEarned, a.lifetimeEarned);
    });
    let n = if (limit == 0 or limit > sorted.size()) sorted.size() else limit;
    Array.tabulate<{ member : Principal; lifetimeEarned : Nat; tier : Text }>(n, func(i) {
      let (p, m) = sorted[i];
      { member = p; lifetimeEarned = m.lifetimeEarned; tier = tierOf(m.lifetimeEarned) };
    });
  };
}
