use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const Q: u128 = 1_000_000; // 1 NEAR in internal units (micro-NEAR)
const STORAGE: NearToken = NearToken::from_millinear(50); // 0.05 NEAR

fn owner() -> AccountId {
    accounts(0)
}
fn alice() -> AccountId {
    accounts(1)
}
fn bob() -> AccountId {
    accounts(2)
}
fn agent() -> AccountId {
    "agent.alice.testnet".parse().unwrap()
}

fn ctx(predecessor: AccountId, deposit: NearToken, ts: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("quire.testnet".parse().unwrap())
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .block_timestamp(ts);
    testing_env!(b.build());
}
fn as_user(a: AccountId) {
    ctx(a, NearToken::from_yoctonear(1), 0)
}
fn as_view(a: AccountId) {
    ctx(a, NearToken::from_yoctonear(0), 0)
}

fn register(c: &mut QuireMarket, a: AccountId) {
    ctx(a.clone(), STORAGE, 0);
    c.storage_deposit(None);
}
/// Deposit `amount` internal units of NEAR from `a`.
fn deposit(c: &mut QuireMarket, a: AccountId, amount: u128) {
    ctx(a, NearToken::from_yoctonear(amount * YOCTO_PER_UNIT), 0);
    c.deposit();
}

fn setup() -> QuireMarket {
    ctx(owner(), NearToken::from_yoctonear(0), 0);
    let mut c = QuireMarket::new(owner(), owner(), U64(1_000), U128(1_000_000 * Q), U128(10_000_000 * Q));
    register(&mut c, owner());
    deposit(&mut c, owner(), 100_000 * Q);
    for u in [alice(), bob()] {
        register(&mut c, u.clone());
        deposit(&mut c, u, 1_000 * Q);
    }
    as_view(owner());
    c.create_market("btc-150k".into(), "Will Bitcoin exceed $150,000?".into(), "crypto".into(), U128(400_000), U128(10_000 * Q), 100);
    c
}

/// Sum of all YES/NO shares (pool + holders) must equal sets.
fn assert_solvent(c: &QuireMarket, holders: &[AccountId]) {
    let m = c.get_market(0).unwrap();
    let (mut y, mut n) = (m.pool_yes.0, m.pool_no.0);
    for h in holders {
        let p = c.get_position(0, h.clone());
        y += p.yes.0;
        n += p.no.0;
    }
    assert_eq!(y, m.sets.0, "YES supply != sets");
    assert_eq!(n, m.sets.0, "NO supply != sets");
}

// ---------- cross-implementation vectors ----------

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct Vector {
    kind: String,
    ok: bool,
    liquidity: Option<String>,
    prob_ppm: Option<String>,
    yes: Option<String>,
    no: Option<String>,
    lp_yes: Option<String>,
    lp_no: Option<String>,
    outcome: Option<String>,
    amount: Option<String>,
    fee_bps: Option<String>,
    out: Option<String>,
    fee: Option<String>,
    gross: Option<String>,
    new_yes: Option<String>,
    new_no: Option<String>,
}

fn u(s: &Option<String>) -> u128 {
    s.as_ref().unwrap().parse().unwrap()
}

#[test]
fn matches_typescript_reference_vectors() {
    let raw = include_str!("../tests/vectors.json");
    let vs: Vec<Vector> = serde_json::from_str(raw).unwrap();
    assert!(vs.len() >= 800);
    for (i, v) in vs.iter().enumerate() {
        match v.kind.as_str() {
            "seed" => {
                let r = fpmm::seed_pool(u(&v.liquidity), u(&v.prob_ppm));
                assert_eq!(r.is_ok(), v.ok, "seed #{i}");
                if let Ok(s) = r {
                    assert_eq!((s.pool.yes, s.pool.no, s.lp_yes, s.lp_no), (u(&v.yes), u(&v.no), u(&v.lp_yes), u(&v.lp_no)), "seed #{i}");
                }
            }
            kind => {
                let pool = fpmm::Pool { yes: u(&v.yes), no: u(&v.no) };
                let side = if v.outcome.as_deref() == Some("YES") { Side::Yes } else { Side::No };
                if kind == "buy" {
                    let r = fpmm::quote_buy(&pool, side, u(&v.amount), u(&v.fee_bps));
                    assert_eq!(r.is_ok(), v.ok, "buy #{i}");
                    if let Ok(q) = r {
                        assert_eq!((q.shares_out, q.fee, q.pool_after.yes, q.pool_after.no), (u(&v.out), u(&v.fee), u(&v.new_yes), u(&v.new_no)), "buy #{i}");
                    }
                } else {
                    let r = fpmm::quote_sell(&pool, side, u(&v.amount), u(&v.fee_bps));
                    assert_eq!(r.is_ok(), v.ok, "sell #{i}");
                    if let Ok(q) = r {
                        assert_eq!(
                            (q.collateral_out, q.fee, q.gross, q.pool_after.yes, q.pool_after.no),
                            (u(&v.out), u(&v.fee), u(&v.gross), u(&v.new_yes), u(&v.new_no)),
                            "sell #{i}"
                        );
                    }
                }
            }
        }
    }
}

// ---------- market lifecycle ----------

#[test]
fn create_market_seeds_requested_probability() {
    let c = setup();
    let m = c.get_market(0).unwrap();
    // floor rounding: within 2ppm of the requested 40%
    assert!(m.price_yes_ppm.0.abs_diff(400_000) <= 2, "got {}", m.price_yes_ppm.0);
    assert_eq!(m.sets.0, 10_000 * Q);
    assert_eq!(c.get_account(owner()).unwrap().balance.0, 90_000 * Q);
    assert_solvent(&c, &[owner()]);
}

#[test]
fn human_buy_and_sell_round_trip() {
    let mut c = setup();
    as_user(alice());
    let shares = c.buy(0, Outcome::Yes, U128(100 * Q), U128(1), Some("o-1".into()));
    let m = c.get_market(0).unwrap();
    assert!(m.price_yes_ppm.0 > 400_000, "YES price should rise");
    assert_eq!(c.get_position(0, alice()).yes, shares);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, 900 * Q);
    assert_eq!(m.fees.0, Q); // 1% fee
    assert_solvent(&c, &[owner(), alice()]);

    as_user(bob());
    c.buy(0, Outcome::No, U128(50 * Q), U128(1), None);
    assert_solvent(&c, &[owner(), alice(), bob()]);

    as_user(alice());
    let out = c.sell(0, Outcome::Yes, shares, U128(1), Some("o-2".into()));
    assert!(out.0 < 100 * Q, "round trip cannot profit without price movement in our favour");
    assert_eq!(c.get_position(0, alice()).yes.0, 0);
    assert_solvent(&c, &[owner(), alice(), bob()]);
    let m = c.get_market(0).unwrap();
    assert_eq!(m.trade_count.0, 3);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn human_trade_requires_wallet_confirmation() {
    let mut c = setup();
    as_view(alice());
    c.buy(0, Outcome::Yes, U128(10 * Q), U128(1), None);
}

#[test]
#[should_panic(expected = "ERR_SLIPPAGE")]
fn slippage_bound_enforced() {
    let mut c = setup();
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(10 * Q), U128(1_000 * Q), None);
}

#[test]
#[should_panic(expected = "ERR_DUPLICATE_ORDER")]
fn duplicate_order_id_rejected() {
    let mut c = setup();
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(10 * Q), U128(1), Some("same".into()));
    c.buy(0, Outcome::Yes, U128(10 * Q), U128(1), Some("same".into()));
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_BALANCE")]
fn cannot_spend_more_than_balance() {
    let mut c = setup();
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(1_001 * Q), U128(1), None);
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_SHARES")]
fn cannot_sell_shares_not_held() {
    let mut c = setup();
    as_user(alice());
    c.sell(0, Outcome::No, U128(Q), U128(0), None);
}

#[test]
fn first_deposit_registers_and_pays_storage_from_the_deposit() {
    let mut c = setup();
    let carol: AccountId = "carol.near".parse().unwrap();
    deposit(&mut c, carol.clone(), 10 * Q);
    let acc = c.get_account(carol).unwrap();
    let fee_units = (env::storage_byte_cost().as_yoctonear() * ACCOUNT_STORAGE_BYTES as u128).div_ceil(YOCTO_PER_UNIT);
    assert_eq!(acc.balance.0, 10 * Q - fee_units);
    assert!(fee_units < Q / 100, "registration costs well under 0.01 NEAR");
}

#[test]
fn sub_unit_dust_becomes_storage_credit() {
    let mut c = setup();
    let before = c.get_account(alice()).unwrap();
    ctx(alice(), NearToken::from_yoctonear(5 * YOCTO_PER_UNIT + 123), 0);
    c.deposit();
    let after = c.get_account(alice()).unwrap();
    assert_eq!(after.balance.0, before.balance.0 + 5);
    assert_eq!(after.storage_deposit.0, before.storage_deposit.0 + 123);
}

#[test]
#[should_panic(expected = "ERR_DEPOSIT_TOO_SMALL")]
fn first_deposit_must_exceed_registration_cost() {
    let mut c = setup();
    ctx("tiny.near".parse().unwrap(), NearToken::from_yoctonear(YOCTO_PER_UNIT), 0);
    c.deposit();
}

#[test]
fn anyone_registered_can_create_a_market_from_their_own_balance() {
    let mut c = setup();
    as_view(alice());
    let id = c.create_market("alice-q".into(), "Will it rain?".into(), "other".into(), U128(700_000), U128(10 * Q), 100);
    assert_eq!(id, 1);
    assert_eq!(c.get_account(alice()).unwrap().balance.0 <= 990 * Q, true);
    // leftover shares from the uneven seed belong to the creator, not the contract owner
    assert!(c.get_position(1, alice()).yes.0 > 0);
    assert_eq!(c.get_position(1, owner()).yes.0, 0);
    let m = c.get_market(1).unwrap();
    assert_eq!(m.pool_no.0, m.sets.0);
}

#[test]
#[should_panic(expected = "ERR_LIQUIDITY_TOO_LOW")]
fn market_needs_a_minimum_seed() {
    let mut c = setup();
    as_view(alice());
    c.create_market("x".into(), "x?".into(), "c".into(), U128(500_000), U128(MIN_MARKET_LIQUIDITY - 1), 100);
}

#[test]
#[should_panic(expected = "ERR_NOT_REGISTERED")]
fn unregistered_account_cannot_create_a_market() {
    let mut c = setup();
    as_view("stranger.testnet".parse().unwrap());
    c.create_market("x".into(), "x?".into(), "c".into(), U128(500_000), U128(Q), 100);
}

#[test]
#[should_panic(expected = "ERR_INSUFFICIENT_BALANCE")]
fn creator_cannot_seed_more_than_they_hold() {
    let mut c = setup();
    as_view(alice());
    c.create_market("x".into(), "x?".into(), "c".into(), U128(500_000), U128(1_001 * Q), 100);
}

// ---------- agents ----------

fn setup_agent(c: &mut QuireMarket) {
    ctx(alice(), STORAGE, 0);
    c.register_agent(agent(), U128(20 * Q), U128(50 * Q));
    as_user(alice());
    c.fund_agent(agent(), U128(200 * Q));
}

#[test]
fn agent_trades_within_limits() {
    let mut c = setup();
    setup_agent(&mut c);
    as_view(agent());
    c.buy(0, Outcome::Yes, U128(20 * Q), U128(1), Some("a-1".into()));
    c.buy(0, Outcome::No, U128(20 * Q), U128(1), Some("a-2".into()));
    let acc = c.get_account(agent()).unwrap();
    assert_eq!(acc.agent.as_ref().unwrap().spent.0, 40 * Q);
    assert_eq!(acc.balance.0, 160 * Q);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, 800 * Q);
    assert_solvent(&c, &[owner(), agent()]);
}

#[test]
#[should_panic(expected = "ERR_AGENT_MAX_TRADE")]
fn agent_max_trade_enforced() {
    let mut c = setup();
    setup_agent(&mut c);
    as_view(agent());
    c.buy(0, Outcome::Yes, U128(21 * Q), U128(1), None);
}

#[test]
#[should_panic(expected = "ERR_AGENT_SPEND_LIMIT")]
fn agent_spend_limit_enforced() {
    let mut c = setup();
    setup_agent(&mut c);
    as_view(agent());
    for _ in 0..3 {
        c.buy(0, Outcome::Yes, U128(20 * Q), U128(1), None);
    }
}

#[test]
#[should_panic(expected = "ERR_AGENT_DISABLED")]
fn disabled_agent_cannot_trade() {
    let mut c = setup();
    setup_agent(&mut c);
    as_view(alice());
    c.update_agent(agent(), Some(false), None, None, None);
    as_view(agent());
    c.buy(0, Outcome::Yes, U128(Q), U128(1), None);
}

#[test]
#[should_panic(expected = "ERR_AGENT_CANNOT_WITHDRAW")]
fn agent_cannot_withdraw() {
    let mut c = setup();
    setup_agent(&mut c);
    as_user(agent());
    let _ = c.withdraw(U128(Q));
}

#[test]
#[should_panic(expected = "ERR_NOT_AGENT_OWNER")]
fn stranger_cannot_change_agent() {
    let mut c = setup();
    setup_agent(&mut c);
    as_view(bob());
    c.update_agent(agent(), None, Some(U128(1_000 * Q)), None, None);
}

#[test]
fn owner_reclaims_agent_funds() {
    let mut c = setup();
    setup_agent(&mut c);
    as_user(alice());
    c.reclaim_agent_funds(agent(), U128(200 * Q));
    assert_eq!(c.get_account(agent()).unwrap().balance.0, 0);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, 1_000 * Q);
}

// ---------- resolution ----------

#[test]
fn resolution_flow_and_redemption() {
    let mut c = setup();
    as_user(alice());
    let yes = c.buy(0, Outcome::Yes, U128(100 * Q), U128(1), None);
    as_user(bob());
    c.buy(0, Outcome::No, U128(100 * Q), U128(1), None);

    as_view(owner());
    c.propose_resolution(0, Resolution::Yes, "https://example.org/evidence".into());
    assert_eq!(c.get_market(0).unwrap().status, MarketStatus::ResolutionProposed);

    ctx(owner(), NearToken::from_yoctonear(0), 2_000);
    c.finalize_resolution(0);

    let before = c.get_account(alice()).unwrap().balance.0;
    as_view(alice());
    let paid = c.redeem(0);
    assert_eq!(paid, yes);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, before + yes.0);
    as_view(bob());
    assert_eq!(c.redeem(0).0, 0);

    // remaining sets must still cover owner LP + pool YES
    let m = c.get_market(0).unwrap();
    let lp = c.get_position(0, owner()).yes.0;
    assert_eq!(m.sets.0, m.pool_yes.0 + lp);
}

#[test]
#[should_panic(expected = "ERR_MARKET_NOT_ACTIVE")]
fn no_trading_while_resolution_pending() {
    let mut c = setup();
    as_view(owner());
    c.propose_resolution(0, Resolution::No, String::new());
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(Q), U128(1), None);
}

#[test]
#[should_panic(expected = "ERR_CHALLENGE_WINDOW_OPEN")]
fn cannot_finalize_inside_challenge_window() {
    let mut c = setup();
    as_view(owner());
    c.propose_resolution(0, Resolution::No, String::new());
    ctx(owner(), NearToken::from_yoctonear(0), 500);
    c.finalize_resolution(0);
}

#[test]
fn resolver_can_cancel_proposal_and_market_continues() {
    let mut c = setup();
    as_view(owner());
    c.propose_resolution(0, Resolution::No, String::new());
    c.cancel_resolution(0);
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(Q), U128(1), None);
}

#[test]
fn invalid_resolution_pays_half_per_share() {
    let mut c = setup();
    as_user(alice());
    let s = c.buy(0, Outcome::Yes, U128(100 * Q), U128(1), None);
    as_view(owner());
    c.propose_resolution(0, Resolution::Invalid, String::new());
    ctx(owner(), NearToken::from_yoctonear(0), 5_000);
    c.finalize_resolution(0);
    as_view(alice());
    assert_eq!(c.redeem(0).0, s.0 / 2);
}

#[test]
fn storage_for_new_positions_is_paid_from_balance() {
    ctx(owner(), NearToken::from_yoctonear(0), 0);
    let mut c = QuireMarket::new(owner(), owner(), U64(1_000), U128(1_000_000 * Q), U128(10_000_000 * Q));
    deposit(&mut c, owner(), 100_000 * Q);
    as_view(owner());
    c.create_market("m0".into(), "q?".into(), "c".into(), U128(500_000), U128(100 * Q), 100);
    deposit(&mut c, alice(), 100 * Q); // registers with exactly the account record prepaid
    let before = c.get_account(alice()).unwrap();
    as_user(alice());
    c.buy(0, Outcome::Yes, U128(Q), U128(1), None);
    let after = c.get_account(alice()).unwrap();
    let storage_units = (env::storage_byte_cost().as_yoctonear() * POSITION_STORAGE_BYTES as u128).div_ceil(YOCTO_PER_UNIT);
    assert_eq!(after.balance.0, before.balance.0 - Q - storage_units);
}

// ---------- real-money safety caps ----------

#[test]
#[should_panic(expected = "ERR_ACCOUNT_CAP")]
fn deposit_over_account_cap_fails() {
    let mut c = setup();
    as_view(owner());
    c.set_caps(U128(1_500 * Q), U128(10_000_000 * Q));
    deposit(&mut c, alice(), 600 * Q);
}

#[test]
fn deposit_up_to_account_cap_succeeds() {
    let mut c = setup();
    as_view(owner());
    c.set_caps(U128(1_500 * Q), U128(10_000_000 * Q));
    deposit(&mut c, alice(), 500 * Q);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, 1_500 * Q);
}

#[test]
#[should_panic(expected = "ERR_TVL_CAP")]
fn deposit_over_tvl_cap_fails() {
    let mut c = setup();
    let total = c.get_config().total_collateral.0;
    assert_eq!(total, 102_000 * Q);
    as_view(owner());
    c.set_caps(U128(1_000_000 * Q), U128(total + 10 * Q));
    deposit(&mut c, bob(), 11 * Q);
}

#[test]
fn withdrawals_work_while_paused_and_reduce_total() {
    let mut c = setup();
    as_view(owner());
    c.set_paused(true);
    let before = c.get_config().total_collateral.0;
    as_user(alice());
    let _ = c.withdraw(U128(100 * Q));
    assert_eq!(c.get_account(alice()).unwrap().balance.0, 900 * Q);
    assert_eq!(c.get_config().total_collateral.0, before - 100 * Q);
}

#[test]
#[should_panic(expected = "ERR_NOT_OWNER")]
fn only_owner_sets_caps() {
    let mut c = setup();
    as_view(alice());
    c.set_caps(U128(1), U128(1));
}

#[test]
fn pool_goes_back_to_the_market_creator() {
    let mut c = setup();
    as_view(alice());
    let id = c.create_market("alice-q".into(), "Will it rain?".into(), "other".into(), U128(500_000), U128(10 * Q), 100);
    assert_eq!(c.get_market_creator(id), alice());
    assert_eq!(c.get_market_creator(0), owner()); // seeded by the owner in setup
    as_user(bob());
    c.buy(id, Outcome::Yes, U128(5 * Q), U128(1), None);
    as_view(owner());
    c.propose_resolution(id, Resolution::No, String::new());
    ctx(owner(), NearToken::from_yoctonear(0), 5_000);
    c.finalize_resolution(id);
    let before = c.get_account(alice()).unwrap().balance.0;
    as_view(alice());
    let paid = c.redeem_pool(id).0;
    assert!(paid > 0);
    assert_eq!(c.get_account(alice()).unwrap().balance.0, before + paid);
}

#[test]
#[should_panic(expected = "ERR_NOT_CREATOR")]
fn strangers_cannot_take_a_pool() {
    let mut c = setup();
    as_view(owner());
    c.propose_resolution(0, Resolution::No, String::new());
    ctx(owner(), NearToken::from_yoctonear(0), 5_000);
    c.finalize_resolution(0);
    as_view(bob());
    c.redeem_pool(0);
}

// ---------- disputes ----------

fn jury() -> AccountId {
    "jury.testnet".parse().unwrap()
}

fn with_jury() -> QuireMarket {
    let mut c = setup();
    as_view(owner());
    c.set_resolver(jury());
    c
}

fn as_user_at(a: AccountId, ts: u64) {
    ctx(a, NearToken::from_yoctonear(1), ts)
}

#[test]
fn upheld_dispute_refunds_bond_and_new_ruling_finalizes() {
    let mut c = with_jury();
    as_view(jury());
    c.propose_resolution(0, Resolution::Yes, String::new());
    let before = c.get_account(bob()).unwrap().balance.0;
    as_user_at(bob(), 500);
    c.dispute_resolution(0);
    assert_eq!(c.get_account(bob()).unwrap().balance.0, before - DISPUTE_BOND);
    assert_eq!(c.get_market(0).unwrap().status, MarketStatus::Active);
    assert_eq!(c.get_dispute(0).unwrap().disputed, Resolution::Yes);

    ctx(jury(), NearToken::from_yoctonear(0), 600);
    c.propose_resolution(0, Resolution::No, String::new());
    assert_eq!(c.get_account(bob()).unwrap().balance.0, before);
    assert!(c.get_dispute(0).is_none());
    ctx(alice(), NearToken::from_yoctonear(0), 1_700);
    c.finalize_resolution(0);
    assert_eq!(c.get_market(0).unwrap().resolved, Some(Resolution::No));
}

#[test]
fn rejected_dispute_pays_bond_to_creator() {
    let mut c = with_jury();
    as_view(jury());
    c.propose_resolution(0, Resolution::Yes, String::new());
    let creator_before = c.get_account(owner()).unwrap().balance.0;
    let bob_before = c.get_account(bob()).unwrap().balance.0;
    as_user_at(bob(), 10);
    c.dispute_resolution(0);
    ctx(jury(), NearToken::from_yoctonear(0), 20);
    c.propose_resolution(0, Resolution::Yes, String::new());
    assert_eq!(c.get_account(owner()).unwrap().balance.0, creator_before + DISPUTE_BOND);
    assert_eq!(c.get_account(bob()).unwrap().balance.0, bob_before - DISPUTE_BOND);
}

#[test]
#[should_panic(expected = "ERR_CHALLENGE_WINDOW_CLOSED")]
fn cannot_dispute_after_window() {
    let mut c = with_jury();
    as_view(jury());
    c.propose_resolution(0, Resolution::Yes, String::new());
    as_user_at(bob(), 1_000);
    c.dispute_resolution(0);
}

#[test]
#[should_panic(expected = "ERR_BAD_STATUS")]
fn cannot_dispute_without_proposal() {
    let mut c = with_jury();
    as_user(bob());
    c.dispute_resolution(0);
}

#[test]
#[should_panic(expected = "ERR_NOT_RESOLVER")]
fn owner_cannot_propose_once_jury_is_resolver() {
    let mut c = with_jury();
    as_view(owner());
    c.propose_resolution(0, Resolution::No, String::new());
}

#[test]
#[should_panic(expected = "ERR_NOT_RESOLVER")]
fn owner_cannot_cancel_jury_ruling() {
    let mut c = with_jury();
    as_view(jury());
    c.propose_resolution(0, Resolution::No, String::new());
    as_view(owner());
    c.cancel_resolution(0);
}

#[test]
fn owner_sets_challenge_period() {
    let mut c = setup();
    as_view(owner());
    c.set_challenge_period(U64(600_000_000_000));
    assert_eq!(c.get_config().challenge_period_ns.0, 600_000_000_000);
}
