//! Quire market contract — perpetual binary claim markets priced by an FPMM.
//!
//! Collateral: native NEAR. Internally amounts are micro-NEAR (1 unit = 10^-6 NEAR
//! = 10^18 yoctoNEAR), so the integer FPMM math is unchanged. A winning share pays 1 NEAR.
//! The first deposit registers the account; storage for new records is paid from the
//! account's own balance, so trades never fail for lack of a separate storage deposit.
//!
//! Security model (see docs/SECURITY.md):
//! - Human trades and withdrawals require 1 yoctoNEAR => full-access-key wallet confirmation.
//! - Registered agents trade without a deposit (function-call key), but only inside
//!   owner-set limits enforced here on-chain: enabled flag, max trade size,
//!   cumulative spend limit, and a balance the owner explicitly funded. Agents
//!   can never withdraw; only their owner can reclaim agent funds.
//! - Every trade takes a min-out slippage bound and an optional client order id
//!   that is rejected if reused (duplicate-execution protection).
//! - Resolution is optional for perpetual markets: the resolver (an AI jury
//!   account) proposes, anyone can dispute inside the challenge window by
//!   posting a bond, and once a window passes undisputed anyone can finalize.
//!   The owner can pause trading but cannot propose, cancel or change a ruling.

pub mod fpmm;

use fpmm::{Pool, Side};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

pub const EVENT_STANDARD: &str = "quire";
pub const EVENT_VERSION: &str = "1.0.0";

/// Conservative fixed storage charges (bytes) per record type.
pub const ACCOUNT_STORAGE_BYTES: u64 = 300;
pub const POSITION_STORAGE_BYTES: u64 = 200;
pub const ORDER_ID_STORAGE_BYTES: u64 = 120;

const MAX_QUESTION_LEN: usize = 300;
const MAX_SLUG_LEN: usize = 80;
const MAX_CATEGORY_LEN: usize = 32;
const MAX_ORDER_ID_LEN: usize = 64;
const MAX_URI_LEN: usize = 300;

const GAS_CALLBACK: Gas = Gas::from_tgas(10);

/// Smallest seed for a new market: 0.1 NEAR.
pub const MIN_MARKET_LIQUIDITY: u128 = 100_000;

/// Bond to dispute a proposed ruling: 0.5 NEAR.
pub const DISPUTE_BOND: u128 = 500_000;

fn dispute_key(market_id: u32) -> Vec<u8> {
    let mut k = b"dispute:".to_vec();
    k.extend_from_slice(&market_id.to_le_bytes());
    k
}

fn resolution_code(r: Resolution) -> u8 {
    match r {
        Resolution::Yes => 0,
        Resolution::No => 1,
        Resolution::Invalid => 2,
    }
}

fn resolution_from_code(c: u8) -> Resolution {
    match c {
        0 => Resolution::Yes,
        1 => Resolution::No,
        _ => Resolution::Invalid,
    }
}

/// A pending dispute: who posted the bond and which ruling they rejected.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DisputeView {
    pub account_id: AccountId,
    pub disputed: Resolution,
    pub bond: U128,
}

fn creator_key(market_id: u32) -> Vec<u8> {
    let mut k = b"creator:".to_vec();
    k.extend_from_slice(&market_id.to_le_bytes());
    k
}

/// yoctoNEAR per internal unit (1 unit = 1 micro-NEAR).
pub const YOCTO_PER_UNIT: u128 = 1_000_000_000_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Markets,
    Accounts,
    Positions,
    Orders,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Outcome {
    Yes,
    No,
}

impl From<Outcome> for Side {
    fn from(o: Outcome) -> Self {
        match o {
            Outcome::Yes => Side::Yes,
            Outcome::No => Side::No,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Resolution {
    Yes,
    No,
    Invalid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MarketStatus {
    Active,
    Paused,
    ResolutionProposed,
    Resolved,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Market {
    pub id: u32,
    pub slug: String,
    pub question: String,
    pub category: String,
    pub pool_yes: u128,
    pub pool_no: u128,
    /// Complete sets outstanding == collateral backing all outcome shares.
    pub sets: u128,
    pub fees: u128,
    pub fee_bps: u16,
    pub volume: u128,
    pub trade_count: u64,
    pub status: MarketStatus,
    pub proposed: Option<Resolution>,
    pub proposed_at: u64,
    pub resolution_uri: String,
    pub resolved: Option<Resolution>,
    pub created_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentConfig {
    pub owner_id: AccountId,
    pub max_trade: U128,
    pub spend_limit: U128,
    pub spent: U128,
    pub enabled: bool,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct Account {
    pub balance: u128,
    pub storage_deposit: u128,
    pub storage_used: u64,
    pub agent: Option<AgentConfig>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PositionKey {
    pub market_id: u32,
    pub account_id: AccountId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Position {
    pub yes: U128,
    pub no: U128,
}

// ---------- JSON views ----------

#[near(serializers = [json])]
pub struct MarketView {
    pub id: u32,
    pub slug: String,
    pub question: String,
    pub category: String,
    pub pool_yes: U128,
    pub pool_no: U128,
    pub sets: U128,
    pub fees: U128,
    pub fee_bps: u16,
    pub volume: U128,
    pub trade_count: U64,
    pub status: MarketStatus,
    pub price_yes_ppm: U128,
    pub proposed: Option<Resolution>,
    pub proposed_at: U64,
    pub resolution_uri: String,
    pub resolved: Option<Resolution>,
    pub created_at: U64,
}

#[near(serializers = [json])]
pub struct AccountView {
    pub balance: U128,
    pub storage_deposit: U128,
    pub storage_used: U64,
    pub storage_available: U128,
    pub agent: Option<AgentConfig>,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner_id: AccountId,
    pub resolver_id: AccountId,
    pub collateral: String,
    pub yocto_per_unit: U128,
    pub challenge_period_ns: U64,
    pub paused: bool,
    pub market_count: u32,
    pub account_cap: U128,
    pub tvl_cap: U128,
    pub total_collateral: U128,
    pub storage_byte_cost: U128,
    pub account_storage_bytes: U64,
    pub position_storage_bytes: U64,
}

#[near(serializers = [json])]
pub struct BuyQuoteView {
    pub shares_out: U128,
    pub fee: U128,
    pub pool_yes_after: U128,
    pub pool_no_after: U128,
    pub price_yes_after_ppm: U128,
}

#[near(serializers = [json])]
pub struct SellQuoteView {
    pub collateral_out: U128,
    pub fee: U128,
    pub pool_yes_after: U128,
    pub pool_no_after: U128,
    pub price_yes_after_ppm: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct QuireMarket {
    owner_id: AccountId,
    resolver_id: AccountId,
    challenge_period_ns: u64,
    paused: bool,
    markets: Vector<Market>,
    accounts: LookupMap<AccountId, Account>,
    positions: LookupMap<PositionKey, Position>,
    orders: LookupSet<Vec<u8>>,
    /// Real-money safety rails (owner-set): max collateral per account and in total.
    account_cap: u128,
    tvl_cap: u128,
    /// Collateral the contract accounts for: deposits minus withdrawals.
    total_collateral: u128,
}

fn emit(event: &str, data: serde_json::Value) {
    let payload = json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{}", payload));
}

fn fpmm_err(e: fpmm::FpmmError) -> ! {
    env::panic_str(e.code())
}

#[near]
impl QuireMarket {
    #[init]
    pub fn new(
        owner_id: AccountId,
        resolver_id: AccountId,
        challenge_period_ns: U64,
        account_cap: U128,
        tvl_cap: U128,
    ) -> Self {
        Self {
            owner_id,
            resolver_id,
            challenge_period_ns: challenge_period_ns.0,
            paused: false,
            markets: Vector::new(StorageKey::Markets),
            accounts: LookupMap::new(StorageKey::Accounts),
            positions: LookupMap::new(StorageKey::Positions),
            orders: LookupSet::new(StorageKey::Orders),
            account_cap: account_cap.0,
            tvl_cap: tvl_cap.0,
            total_collateral: 0,
        }
    }

    // ---------------- storage (NEP-145 style) ----------------

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) -> StorageBalance {
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();
        let min = self.bytes_cost(ACCOUNT_STORAGE_BYTES);
        let acc = match self.accounts.get_mut(&account_id) {
            Some(acc) => {
                acc.storage_deposit += deposit;
                acc.clone()
            }
            None => {
                require!(deposit >= min, "ERR_STORAGE_DEPOSIT_TOO_LOW");
                let acc = Account { storage_deposit: deposit, storage_used: ACCOUNT_STORAGE_BYTES, ..Default::default() };
                self.accounts.insert(account_id.clone(), acc.clone());
                emit("account_registered", json!({ "account_id": account_id }));
                acc
            }
        };
        self.storage_balance(&acc)
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.accounts.get(&account_id).map(|a| self.storage_balance(a))
    }

    // ---------------- deposits & withdrawals ----------------

    /// Deposit the attached NEAR into the caller's trading balance.
    /// Registers the caller on first use (storage is taken from the deposit).
    /// Over-cap deposits fail and the attached NEAR is returned by the protocol.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        require!(!self.paused, "ERR_PAUSED");
        let account_id = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        let mut units = attached / YOCTO_PER_UNIT;
        let dust = attached % YOCTO_PER_UNIT;
        if self.accounts.get(&account_id).is_none() {
            let fee_units = self.bytes_cost(ACCOUNT_STORAGE_BYTES).div_ceil(YOCTO_PER_UNIT);
            require!(units > fee_units, "ERR_DEPOSIT_TOO_SMALL");
            units -= fee_units;
            let acc = Account { storage_deposit: fee_units * YOCTO_PER_UNIT, storage_used: ACCOUNT_STORAGE_BYTES, ..Default::default() };
            self.accounts.insert(account_id.clone(), acc);
            emit("account_registered", json!({ "account_id": account_id }));
        }
        require!(units > 0, "ERR_ZERO_AMOUNT");
        let (account_cap, tvl_cap, total) = (self.account_cap, self.tvl_cap, self.total_collateral);
        let acc = self.accounts.get_mut(&account_id).unwrap();
        require!(acc.agent.is_none(), "ERR_AGENT_USE_FUND_AGENT");
        require!(acc.balance + units <= account_cap, "ERR_ACCOUNT_CAP");
        require!(total + units <= tvl_cap, "ERR_TVL_CAP");
        acc.balance += units;
        acc.storage_deposit += dust; // sub-unit remainder becomes storage credit
        self.total_collateral += units;
        emit("deposit", json!({ "account_id": account_id, "amount": U128(units) }));
        U128(acc.balance)
    }

    /// Withdraw NEAR to the caller's wallet. Requires 1 yoctoNEAR (full-access key).
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let acc = self.accounts.get_mut(&account_id).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
        require!(acc.agent.is_none(), "ERR_AGENT_CANNOT_WITHDRAW");
        require!(amount.0 > 0 && acc.balance >= amount.0, "ERR_INSUFFICIENT_BALANCE");
        acc.balance -= amount.0;
        self.total_collateral -= amount.0;
        emit("withdraw_started", json!({ "account_id": account_id, "amount": amount }));
        Promise::new(account_id.clone())
            .transfer(NearToken::from_yoctonear(amount.0 * YOCTO_PER_UNIT))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_withdraw(account_id, amount))
    }

    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, amount: U128, #[callback_result] result: Result<(), PromiseError>) -> bool {
        if result.is_ok() {
            emit("withdraw", json!({ "account_id": account_id, "amount": amount }));
            true
        } else {
            if let Some(acc) = self.accounts.get_mut(&account_id) {
                acc.balance += amount.0;
            }
            self.total_collateral += amount.0;
            emit("withdraw_failed", json!({ "account_id": account_id, "amount": amount }));
            false
        }
    }

    // ---------------- market admin ----------------

    /// Create a perpetual market. Anyone can: the creator seeds it from their own balance
    /// and receives any leftover outcome shares. A minimum seed keeps out empty markets.
    pub fn create_market(
        &mut self,
        slug: String,
        question: String,
        category: String,
        initial_prob_ppm: U128,
        liquidity: U128,
        fee_bps: u16,
    ) -> u32 {
        require!(!self.paused, "ERR_PAUSED");
        require!(liquidity.0 >= MIN_MARKET_LIQUIDITY, "ERR_LIQUIDITY_TOO_LOW");
        require!(!slug.is_empty() && slug.len() <= MAX_SLUG_LEN, "ERR_BAD_SLUG");
        require!(!question.is_empty() && question.len() <= MAX_QUESTION_LEN, "ERR_BAD_QUESTION");
        require!(category.len() <= MAX_CATEGORY_LEN, "ERR_BAD_CATEGORY");
        require!((fee_bps as u128) <= fpmm::MAX_FEE_BPS, "ERR_BAD_FEE");
        let seed = fpmm::seed_pool(liquidity.0, initial_prob_ppm.0).unwrap_or_else(|e| fpmm_err(e));
        let owner = env::predecessor_account_id();
        require!(self.accounts.get(&owner).map(|a| a.agent.is_none()).unwrap_or(false), "ERR_NOT_REGISTERED");
        self.debit(&owner, liquidity.0);
        let id = self.markets.len();
        let market = Market {
            id,
            slug: slug.clone(),
            question: question.clone(),
            category: category.clone(),
            pool_yes: seed.pool.yes,
            pool_no: seed.pool.no,
            sets: liquidity.0,
            fees: 0,
            fee_bps,
            volume: 0,
            trade_count: 0,
            status: MarketStatus::Active,
            proposed: None,
            proposed_at: 0,
            resolution_uri: String::new(),
            resolved: None,
            created_at: env::block_timestamp(),
        };
        self.markets.push(market);
        // Kept under its own storage key so the Market layout (and existing markets) stay unchanged.
        env::storage_write(&creator_key(id), owner.as_bytes());
        if seed.lp_yes > 0 || seed.lp_no > 0 {
            self.credit_position(id, &owner, seed.lp_yes, seed.lp_no);
        }
        emit(
            "market_created",
            json!({
                "market_id": id, "creator": owner, "slug": slug, "question": question, "category": category,
                "liquidity": liquidity, "fee_bps": fee_bps,
                "pool_yes": U128(seed.pool.yes), "pool_no": U128(seed.pool.no),
                "lp_yes": U128(seed.lp_yes), "lp_no": U128(seed.lp_no),
                "price_yes_ppm": U128(fpmm::price_yes(&seed.pool)),
            }),
        );
        id
    }

    pub fn set_market_paused(&mut self, market_id: u32, paused: bool) {
        self.assert_owner();
        let m = self.market_mut(market_id);
        match (&m.status, paused) {
            (MarketStatus::Active, true) => m.status = MarketStatus::Paused,
            (MarketStatus::Paused, false) => m.status = MarketStatus::Active,
            _ => env::panic_str("ERR_BAD_STATUS"),
        }
        emit("market_paused", json!({ "market_id": market_id, "paused": paused }));
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
        emit("contract_paused", json!({ "paused": paused }));
    }

    pub fn set_caps(&mut self, account_cap: U128, tvl_cap: U128) {
        self.assert_owner();
        self.account_cap = account_cap.0;
        self.tvl_cap = tvl_cap.0;
        emit("caps_updated", json!({ "account_cap": account_cap, "tvl_cap": tvl_cap }));
    }

    pub fn set_resolver(&mut self, resolver_id: AccountId) {
        self.assert_owner();
        self.resolver_id = resolver_id;
    }

    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.assert_owner();
        self.owner_id = owner_id;
    }

    /// Move accrued trading fees of a market to the owner's balance.
    pub fn claim_fees(&mut self, market_id: u32) -> U128 {
        self.assert_owner();
        let m = self.market_mut(market_id);
        let fees = m.fees;
        m.fees = 0;
        let owner = self.owner_id.clone();
        self.accounts.get_mut(&owner).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED")).balance += fees;
        emit("fees_claimed", json!({ "market_id": market_id, "amount": U128(fees) }));
        U128(fees)
    }

    // ---------------- trading ----------------

    /// Buy `outcome` shares with `amount` collateral. Humans attach 1 yoctoNEAR.
    #[payable]
    pub fn buy(&mut self, market_id: u32, outcome: Outcome, amount: U128, min_shares_out: U128, client_order_id: Option<String>) -> U128 {
        let account_id = env::predecessor_account_id();
        let is_agent = self.authorize_trader(&account_id, Some(amount.0));
        self.check_order_id(&account_id, client_order_id.as_deref());
        let m = self.tradable_market(market_id);
        let pool = Pool { yes: m.pool_yes, no: m.pool_no };
        let q = fpmm::quote_buy(&pool, outcome.into(), amount.0, m.fee_bps as u128).unwrap_or_else(|e| fpmm_err(e));
        require!(q.shares_out >= min_shares_out.0, "ERR_SLIPPAGE");

        self.debit(&account_id, amount.0);
        let m = self.market_mut(market_id);
        m.pool_yes = q.pool_after.yes;
        m.pool_no = q.pool_after.no;
        m.sets += amount.0 - q.fee;
        m.fees += q.fee;
        m.volume += amount.0;
        m.trade_count += 1;
        let price = fpmm::price_yes(&q.pool_after);
        let (dy, dn) = match outcome {
            Outcome::Yes => (q.shares_out, 0),
            Outcome::No => (0, q.shares_out),
        };
        self.credit_position(market_id, &account_id, dy, dn);
        emit(
            "trade",
            json!({
                "market_id": market_id, "account_id": account_id, "is_agent": is_agent,
                "side": "BUY", "outcome": outcome, "collateral": amount, "shares": U128(q.shares_out),
                "fee": U128(q.fee), "pool_yes": U128(q.pool_after.yes), "pool_no": U128(q.pool_after.no),
                "price_yes_ppm": U128(price), "client_order_id": client_order_id,
            }),
        );
        U128(q.shares_out)
    }

    /// Sell `shares` of `outcome` back to the pool. Humans attach 1 yoctoNEAR.
    #[payable]
    pub fn sell(&mut self, market_id: u32, outcome: Outcome, shares: U128, min_collateral_out: U128, client_order_id: Option<String>) -> U128 {
        let account_id = env::predecessor_account_id();
        let is_agent = self.authorize_trader(&account_id, None);
        self.check_order_id(&account_id, client_order_id.as_deref());
        let m = self.tradable_market(market_id);
        let pool = Pool { yes: m.pool_yes, no: m.pool_no };
        let fee_bps = m.fee_bps as u128;

        let key = PositionKey { market_id, account_id: account_id.clone() };
        let mut pos = self.positions.get(&key).copied().unwrap_or_default();
        let held = match outcome {
            Outcome::Yes => pos.yes.0,
            Outcome::No => pos.no.0,
        };
        require!(shares.0 > 0 && held >= shares.0, "ERR_INSUFFICIENT_SHARES");
        let q = fpmm::quote_sell(&pool, outcome.into(), shares.0, fee_bps).unwrap_or_else(|e| fpmm_err(e));
        require!(q.collateral_out >= min_collateral_out.0, "ERR_SLIPPAGE");

        match outcome {
            Outcome::Yes => pos.yes = U128(pos.yes.0 - shares.0),
            Outcome::No => pos.no = U128(pos.no.0 - shares.0),
        }
        self.positions.insert(key, pos);
        let m = self.market_mut(market_id);
        m.pool_yes = q.pool_after.yes;
        m.pool_no = q.pool_after.no;
        m.sets -= q.gross;
        m.fees += q.fee;
        m.volume += q.gross;
        m.trade_count += 1;
        self.accounts.get_mut(&account_id).unwrap().balance += q.collateral_out;
        emit(
            "trade",
            json!({
                "market_id": market_id, "account_id": account_id, "is_agent": is_agent,
                "side": "SELL", "outcome": outcome, "collateral": U128(q.collateral_out), "shares": shares,
                "fee": U128(q.fee), "pool_yes": U128(q.pool_after.yes), "pool_no": U128(q.pool_after.no),
                "price_yes_ppm": U128(fpmm::price_yes(&q.pool_after)), "client_order_id": client_order_id,
            }),
        );
        U128(q.collateral_out)
    }

    // ---------------- resolution (optional for perpetual markets) ----------------

    pub fn propose_resolution(&mut self, market_id: u32, resolution: Resolution, evidence_uri: String) {
        require!(env::predecessor_account_id() == self.resolver_id, "ERR_NOT_RESOLVER");
        require!(evidence_uri.len() <= MAX_URI_LEN, "ERR_BAD_URI");
        let now = env::block_timestamp();
        require!(matches!(self.market(market_id).status, MarketStatus::Active | MarketStatus::Paused), "ERR_BAD_STATUS");
        self.settle_dispute(market_id, resolution);
        let m = self.market_mut(market_id);
        m.status = MarketStatus::ResolutionProposed;
        m.proposed = Some(resolution);
        m.proposed_at = now;
        m.resolution_uri = evidence_uri.clone();
        emit("resolution_proposed", json!({ "market_id": market_id, "resolution": resolution, "evidence_uri": evidence_uri }));
    }

    /// The resolver (the AI jury) can withdraw its own proposal during the window,
    /// for example when it sees new evidence. The owner has no say over outcomes.
    pub fn cancel_resolution(&mut self, market_id: u32) {
        require!(env::predecessor_account_id() == self.resolver_id, "ERR_NOT_RESOLVER");
        let m = self.market_mut(market_id);
        require!(m.status == MarketStatus::ResolutionProposed, "ERR_BAD_STATUS");
        m.status = MarketStatus::Active;
        m.proposed = None;
        m.proposed_at = 0;
        emit("resolution_cancelled", json!({ "market_id": market_id }));
    }

    /// Anyone can reject a proposed ruling inside the challenge window by posting
    /// a bond from their Quire balance. The market goes back to trading and the
    /// jury has to rule again. When it does, the bond is returned if the new
    /// ruling differs from the one disputed; otherwise it goes to the market's
    /// creator. One dispute is held per market at a time.
    #[payable]
    pub fn dispute_resolution(&mut self, market_id: u32) {
        near_sdk::assert_one_yocto();
        let account_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        let period = self.challenge_period_ns;
        let m = self.market(market_id);
        require!(m.status == MarketStatus::ResolutionProposed, "ERR_BAD_STATUS");
        require!(now < m.proposed_at + period, "ERR_CHALLENGE_WINDOW_CLOSED");
        require!(env::storage_read(&dispute_key(market_id)).is_none(), "ERR_DISPUTE_PENDING");
        let disputed = m.proposed.unwrap();
        self.debit(&account_id, DISPUTE_BOND);
        let mut v = vec![resolution_code(disputed)];
        v.extend_from_slice(account_id.as_bytes());
        env::storage_write(&dispute_key(market_id), &v);
        let m = self.market_mut(market_id);
        m.status = MarketStatus::Active;
        m.proposed = None;
        m.proposed_at = 0;
        emit("resolution_disputed", json!({ "market_id": market_id, "account_id": account_id, "disputed": disputed, "bond": U128(DISPUTE_BOND) }));
    }

    pub fn get_dispute(&self, market_id: u32) -> Option<DisputeView> {
        let v = env::storage_read(&dispute_key(market_id))?;
        let account_id: AccountId = String::from_utf8(v[1..].to_vec()).ok()?.parse().ok()?;
        Some(DisputeView { account_id, disputed: resolution_from_code(v[0]), bond: U128(DISPUTE_BOND) })
    }

    pub fn set_challenge_period(&mut self, challenge_period_ns: U64) {
        self.assert_owner();
        self.challenge_period_ns = challenge_period_ns.0;
    }

    /// Anyone may finalize after the challenge window.
    pub fn finalize_resolution(&mut self, market_id: u32) {
        let period = self.challenge_period_ns;
        let now = env::block_timestamp();
        let m = self.market_mut(market_id);
        require!(m.status == MarketStatus::ResolutionProposed, "ERR_BAD_STATUS");
        require!(now >= m.proposed_at + period, "ERR_CHALLENGE_WINDOW_OPEN");
        m.status = MarketStatus::Resolved;
        m.resolved = m.proposed;
        emit("market_resolved", json!({ "market_id": market_id, "resolution": m.resolved }));
    }

    /// Redeem the caller's position in a resolved market.
    pub fn redeem(&mut self, market_id: u32) -> U128 {
        let account_id = env::predecessor_account_id();
        let m = self.market(market_id);
        require!(m.status == MarketStatus::Resolved, "ERR_NOT_RESOLVED");
        let resolution = m.resolved.unwrap();
        let key = PositionKey { market_id, account_id: account_id.clone() };
        let Some(pos) = self.positions.get(&key).copied() else {
            return U128(0);
        };
        let payout = payout_for(resolution, pos.yes.0, pos.no.0);
        self.positions.remove(&key);
        self.release_storage(&account_id, POSITION_STORAGE_BYTES);
        self.market_mut(market_id).sets -= payout;
        self.accounts.get_mut(&account_id).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED")).balance += payout;
        emit("redeem", json!({ "market_id": market_id, "account_id": account_id, "payout": U128(payout) }));
        U128(payout)
    }

    /// After resolution, the pool's remaining value goes back to whoever seeded the market.
    /// Markets created before creators were recorded belong to the contract owner.
    pub fn redeem_pool(&mut self, market_id: u32) -> U128 {
        let creator = self.get_market_creator(market_id);
        let caller = env::predecessor_account_id();
        require!(caller == creator || caller == self.owner_id, "ERR_NOT_CREATOR");
        let m = self.market_mut(market_id);
        require!(m.status == MarketStatus::Resolved, "ERR_NOT_RESOLVED");
        let payout = payout_for(m.resolved.unwrap(), m.pool_yes, m.pool_no);
        m.pool_yes = 0;
        m.pool_no = 0;
        m.sets -= payout;
        self.accounts.get_mut(&creator).unwrap().balance += payout;
        emit("redeem", json!({ "market_id": market_id, "account_id": creator, "payout": U128(payout), "pool": true }));
        U128(payout)
    }

    /// Who seeded a market, and so receives its pool after resolution.
    pub fn get_market_creator(&self, market_id: u32) -> AccountId {
        env::storage_read(&creator_key(market_id))
            .and_then(|b| String::from_utf8(b).ok())
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| self.owner_id.clone())
    }

    // ---------------- agents ----------------

    /// Register `agent_id` as a constrained trading agent owned by the caller.
    /// The attached deposit pays the agent account's storage.
    #[payable]
    pub fn register_agent(&mut self, agent_id: AccountId, max_trade: U128, spend_limit: U128) {
        let owner_id = env::predecessor_account_id();
        require!(owner_id != agent_id, "ERR_AGENT_IS_OWNER");
        require!(self.accounts.get(&owner_id).map(|a| a.agent.is_none()).unwrap_or(false), "ERR_OWNER_NOT_REGISTERED");
        require!(self.accounts.get(&agent_id).is_none(), "ERR_AGENT_EXISTS");
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= self.bytes_cost(ACCOUNT_STORAGE_BYTES), "ERR_STORAGE_DEPOSIT_TOO_LOW");
        let cfg = AgentConfig { owner_id: owner_id.clone(), max_trade, spend_limit, spent: U128(0), enabled: true };
        self.accounts.insert(
            agent_id.clone(),
            Account { balance: 0, storage_deposit: deposit, storage_used: ACCOUNT_STORAGE_BYTES, agent: Some(cfg) },
        );
        emit("agent_registered", json!({ "agent_id": agent_id, "owner_id": owner_id, "max_trade": max_trade, "spend_limit": spend_limit }));
    }

    pub fn update_agent(&mut self, agent_id: AccountId, enabled: Option<bool>, max_trade: Option<U128>, spend_limit: Option<U128>, reset_spent: Option<bool>) {
        let caller = env::predecessor_account_id();
        let acc = self.accounts.get_mut(&agent_id).unwrap_or_else(|| env::panic_str("ERR_NOT_AGENT"));
        let cfg = acc.agent.as_mut().unwrap_or_else(|| env::panic_str("ERR_NOT_AGENT"));
        require!(cfg.owner_id == caller, "ERR_NOT_AGENT_OWNER");
        if let Some(e) = enabled {
            cfg.enabled = e;
        }
        if let Some(m) = max_trade {
            cfg.max_trade = m;
        }
        if let Some(s) = spend_limit {
            cfg.spend_limit = s;
        }
        if reset_spent == Some(true) {
            cfg.spent = U128(0);
        }
        let snapshot = cfg.clone();
        emit("agent_updated", json!({ "agent_id": agent_id, "config": snapshot }));
    }

    /// Owner moves collateral from their balance to the agent's trading balance.
    #[payable]
    pub fn fund_agent(&mut self, agent_id: AccountId, amount: U128) {
        near_sdk::assert_one_yocto();
        let owner = env::predecessor_account_id();
        self.assert_agent_owner(&agent_id, &owner);
        self.debit(&owner, amount.0);
        self.accounts.get_mut(&agent_id).unwrap().balance += amount.0;
        emit("agent_funded", json!({ "agent_id": agent_id, "owner_id": owner, "amount": amount }));
    }

    /// Owner pulls collateral back from the agent.
    #[payable]
    pub fn reclaim_agent_funds(&mut self, agent_id: AccountId, amount: U128) {
        near_sdk::assert_one_yocto();
        let owner = env::predecessor_account_id();
        self.assert_agent_owner(&agent_id, &owner);
        self.debit(&agent_id, amount.0);
        self.accounts.get_mut(&owner).unwrap().balance += amount.0;
        emit("agent_reclaimed", json!({ "agent_id": agent_id, "owner_id": owner, "amount": amount }));
    }

    // ---------------- views ----------------

    pub fn get_config(&self) -> Config {
        Config {
            owner_id: self.owner_id.clone(),
            resolver_id: self.resolver_id.clone(),
            collateral: "NEAR".to_string(),
            yocto_per_unit: U128(YOCTO_PER_UNIT),
            challenge_period_ns: U64(self.challenge_period_ns),
            paused: self.paused,
            market_count: self.markets.len(),
            account_cap: U128(self.account_cap),
            tvl_cap: U128(self.tvl_cap),
            total_collateral: U128(self.total_collateral),
            storage_byte_cost: U128(env::storage_byte_cost().as_yoctonear()),
            account_storage_bytes: U64(ACCOUNT_STORAGE_BYTES),
            position_storage_bytes: U64(POSITION_STORAGE_BYTES),
        }
    }

    pub fn get_market(&self, market_id: u32) -> Option<MarketView> {
        self.markets.get(market_id).map(market_view)
    }

    pub fn get_markets(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MarketView> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        (from..self.markets.len().min(from.saturating_add(limit))).filter_map(|i| self.markets.get(i)).map(market_view).collect()
    }

    pub fn get_position(&self, market_id: u32, account_id: AccountId) -> Position {
        self.positions.get(&PositionKey { market_id, account_id }).copied().unwrap_or_default()
    }

    pub fn get_account(&self, account_id: AccountId) -> Option<AccountView> {
        self.accounts.get(&account_id).map(|a| {
            let sb = self.storage_balance(a);
            AccountView {
                balance: U128(a.balance),
                storage_deposit: U128(a.storage_deposit),
                storage_used: U64(a.storage_used),
                storage_available: sb.available,
                agent: a.agent.clone(),
            }
        })
    }

    pub fn quote_buy(&self, market_id: u32, outcome: Outcome, amount: U128) -> BuyQuoteView {
        let m = self.market(market_id);
        let q = fpmm::quote_buy(&Pool { yes: m.pool_yes, no: m.pool_no }, outcome.into(), amount.0, m.fee_bps as u128)
            .unwrap_or_else(|e| fpmm_err(e));
        BuyQuoteView {
            shares_out: U128(q.shares_out),
            fee: U128(q.fee),
            pool_yes_after: U128(q.pool_after.yes),
            pool_no_after: U128(q.pool_after.no),
            price_yes_after_ppm: U128(fpmm::price_yes(&q.pool_after)),
        }
    }

    pub fn quote_sell(&self, market_id: u32, outcome: Outcome, shares: U128) -> SellQuoteView {
        let m = self.market(market_id);
        let q = fpmm::quote_sell(&Pool { yes: m.pool_yes, no: m.pool_no }, outcome.into(), shares.0, m.fee_bps as u128)
            .unwrap_or_else(|e| fpmm_err(e));
        SellQuoteView {
            collateral_out: U128(q.collateral_out),
            fee: U128(q.fee),
            pool_yes_after: U128(q.pool_after.yes),
            pool_no_after: U128(q.pool_after.no),
            price_yes_after_ppm: U128(fpmm::price_yes(&q.pool_after)),
        }
    }
}

// ---------------- internal helpers ----------------

fn payout_for(r: Resolution, yes: u128, no: u128) -> u128 {
    match r {
        Resolution::Yes => yes,
        Resolution::No => no,
        Resolution::Invalid => (yes + no) / 2,
    }
}

fn market_view(m: &Market) -> MarketView {
    let price = if m.pool_yes > 0 && m.pool_no > 0 { fpmm::price_yes(&Pool { yes: m.pool_yes, no: m.pool_no }) } else { 0 };
    MarketView {
        id: m.id,
        slug: m.slug.clone(),
        question: m.question.clone(),
        category: m.category.clone(),
        pool_yes: U128(m.pool_yes),
        pool_no: U128(m.pool_no),
        sets: U128(m.sets),
        fees: U128(m.fees),
        fee_bps: m.fee_bps,
        volume: U128(m.volume),
        trade_count: U64(m.trade_count),
        status: m.status.clone(),
        price_yes_ppm: U128(price),
        proposed: m.proposed,
        proposed_at: U64(m.proposed_at),
        resolution_uri: m.resolution_uri.clone(),
        resolved: m.resolved,
        created_at: U64(m.created_at),
    }
}

impl QuireMarket {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "ERR_NOT_OWNER");
    }

    fn bytes_cost(&self, bytes: u64) -> u128 {
        env::storage_byte_cost().as_yoctonear() * bytes as u128
    }

    fn storage_balance(&self, a: &Account) -> StorageBalance {
        let used = self.bytes_cost(a.storage_used);
        StorageBalance { total: U128(a.storage_deposit), available: U128(a.storage_deposit.saturating_sub(used)) }
    }

    /// Reserve storage for a new record. If prepaid storage is used up, the shortfall
    /// is moved from the account's NEAR balance into its storage deposit.
    fn reserve_storage(&mut self, account_id: &AccountId, bytes: u64) {
        let cost = env::storage_byte_cost().as_yoctonear();
        let acc = self.accounts.get_mut(account_id).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
        acc.storage_used += bytes;
        let needed = cost * acc.storage_used as u128;
        if needed > acc.storage_deposit {
            let units = (needed - acc.storage_deposit).div_ceil(YOCTO_PER_UNIT);
            require!(acc.balance >= units, "ERR_INSUFFICIENT_STORAGE");
            acc.balance -= units;
            acc.storage_deposit += units * YOCTO_PER_UNIT;
            self.total_collateral -= units;
        }
    }

    fn release_storage(&mut self, account_id: &AccountId, bytes: u64) {
        if let Some(acc) = self.accounts.get_mut(account_id) {
            acc.storage_used = acc.storage_used.saturating_sub(bytes).max(ACCOUNT_STORAGE_BYTES);
        }
    }

    /// Settle a held dispute bond when the jury rules again.
    fn settle_dispute(&mut self, market_id: u32, new_ruling: Resolution) {
        let Some(d) = self.get_dispute(market_id) else { return };
        env::storage_remove(&dispute_key(market_id));
        let upheld = new_ruling != d.disputed;
        let creator = self.get_market_creator(market_id);
        let to = if upheld || !self.accounts.contains_key(&creator) { d.account_id.clone() } else { creator };
        if let Some(acc) = self.accounts.get_mut(&to) {
            acc.balance += DISPUTE_BOND;
        }
        emit("dispute_settled", json!({ "market_id": market_id, "account_id": d.account_id, "upheld": upheld, "paid_to": to, "bond": U128(DISPUTE_BOND) }));
    }

    fn debit(&mut self, account_id: &AccountId, amount: u128) {
        let acc = self.accounts.get_mut(account_id).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
        require!(amount > 0 && acc.balance >= amount, "ERR_INSUFFICIENT_BALANCE");
        acc.balance -= amount;
    }

    fn credit_position(&mut self, market_id: u32, account_id: &AccountId, yes: u128, no: u128) {
        let key = PositionKey { market_id, account_id: account_id.clone() };
        let existing = self.positions.get(&key).copied();
        if existing.is_none() {
            self.reserve_storage(account_id, POSITION_STORAGE_BYTES);
        }
        let mut p = existing.unwrap_or_default();
        p.yes = U128(p.yes.0 + yes);
        p.no = U128(p.no.0 + no);
        self.positions.insert(key, p);
    }

    /// Returns whether the caller is an agent. Enforces: global pause, registration,
    /// the human 1-yocto confirmation, and all agent limits.
    fn authorize_trader(&mut self, account_id: &AccountId, buy_amount: Option<u128>) -> bool {
        require!(!self.paused, "ERR_PAUSED");
        let acc = self.accounts.get_mut(account_id).unwrap_or_else(|| env::panic_str("ERR_NOT_REGISTERED"));
        match acc.agent.as_mut() {
            None => {
                near_sdk::assert_one_yocto();
                false
            }
            Some(cfg) => {
                require!(env::attached_deposit().is_zero(), "ERR_AGENT_NO_DEPOSIT");
                require!(cfg.enabled, "ERR_AGENT_DISABLED");
                if let Some(amount) = buy_amount {
                    require!(amount <= cfg.max_trade.0, "ERR_AGENT_MAX_TRADE");
                    let spent = cfg.spent.0 + amount;
                    require!(spent <= cfg.spend_limit.0, "ERR_AGENT_SPEND_LIMIT");
                    cfg.spent = U128(spent);
                }
                true
            }
        }
    }

    fn check_order_id(&mut self, account_id: &AccountId, id: Option<&str>) {
        let Some(id) = id else { return };
        require!(!id.is_empty() && id.len() <= MAX_ORDER_ID_LEN, "ERR_BAD_ORDER_ID");
        let key = env::sha256(format!("{}:{}", account_id, id).as_bytes());
        require!(!self.orders.contains(&key), "ERR_DUPLICATE_ORDER");
        self.orders.insert(key);
        self.reserve_storage(account_id, ORDER_ID_STORAGE_BYTES);
    }

    fn assert_agent_owner(&self, agent_id: &AccountId, owner: &AccountId) {
        let acc = self.accounts.get(agent_id).unwrap_or_else(|| env::panic_str("ERR_NOT_AGENT"));
        let cfg = acc.agent.as_ref().unwrap_or_else(|| env::panic_str("ERR_NOT_AGENT"));
        require!(&cfg.owner_id == owner, "ERR_NOT_AGENT_OWNER");
    }

    fn market(&self, id: u32) -> &Market {
        self.markets.get(id).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"))
    }

    fn market_mut(&mut self, id: u32) -> &mut Market {
        self.markets.get_mut(id).unwrap_or_else(|| env::panic_str("ERR_NO_MARKET"))
    }

    fn tradable_market(&self, id: u32) -> &Market {
        let m = self.market(id);
        require!(m.status == MarketStatus::Active, "ERR_MARKET_NOT_ACTIVE");
        m
    }
}

#[cfg(test)]
mod tests;
