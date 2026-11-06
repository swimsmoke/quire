//! qUSD — testnet-only NEP-141 collateral for Quire.
//!
//! It has NO monetary value. Two ways to get it:
//! 1. `faucet()` — anyone can mint up to FAUCET_AMOUNT once per FAUCET_COOLDOWN_NS.
//! 2. `bridge_mint()` — only the configured `minter_id` (the Quire funding service)
//!    can mint, and must cite a unique `source_ref` (e.g. a NEAR Intents deposit
//!    address that reached SUCCESS on mainnet). Reusing a ref is rejected, so one
//!    verified mainnet deposit can credit testnet at most once.

use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::{FungibleToken, FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue};

pub const FAUCET_AMOUNT: u128 = 1_000 * 1_000_000; // 1,000 qUSD
pub const FAUCET_COOLDOWN_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    Faucet,
    BridgeRefs,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct QusdToken {
    token: FungibleToken,
    owner_id: AccountId,
    minter_id: AccountId,
    last_faucet: LookupMap<AccountId, u64>,
    bridge_refs: LookupMap<String, u128>,
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!("EVENT_JSON:{}", json!({"standard":"qusd","version":"1.0.0","event":event,"data":[data]})));
}

#[near]
impl QusdToken {
    #[init]
    pub fn new(owner_id: AccountId, minter_id: AccountId) -> Self {
        Self {
            token: FungibleToken::new(StorageKey::Token),
            owner_id,
            minter_id,
            last_faucet: LookupMap::new(StorageKey::Faucet),
            bridge_refs: LookupMap::new(StorageKey::BridgeRefs),
        }
    }

    /// Mint FAUCET_AMOUNT to the caller (registers storage if a deposit is attached).
    #[payable]
    pub fn faucet(&mut self) -> U128 {
        let account_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        if let Some(last) = self.last_faucet.get(&account_id) {
            require!(now >= last + FAUCET_COOLDOWN_NS, "ERR_FAUCET_COOLDOWN");
        }
        self.ensure_registered(&account_id);
        self.last_faucet.insert(account_id.clone(), now);
        self.token.internal_deposit(&account_id, FAUCET_AMOUNT);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &account_id,
            amount: U128(FAUCET_AMOUNT),
            memo: Some("faucet"),
        }
        .emit();
        U128(FAUCET_AMOUNT)
    }

    /// Credit testnet qUSD for a verified external funding event. Minter only; one-shot per ref.
    #[payable]
    pub fn bridge_mint(&mut self, account_id: AccountId, amount: U128, source_ref: String) {
        require!(env::predecessor_account_id() == self.minter_id, "ERR_NOT_MINTER");
        require!(!source_ref.is_empty() && source_ref.len() <= 128, "ERR_BAD_REF");
        require!(amount.0 > 0, "ERR_ZERO_AMOUNT");
        require!(self.bridge_refs.get(&source_ref).is_none(), "ERR_REF_USED");
        self.ensure_registered(&account_id);
        self.bridge_refs.insert(source_ref.clone(), amount.0);
        self.token.internal_deposit(&account_id, amount.0);
        near_contract_standards::fungible_token::events::FtMint { owner_id: &account_id, amount, memo: Some("bridge") }.emit();
        emit("bridge_mint", json!({ "account_id": account_id, "amount": amount, "source_ref": source_ref }));
    }

    pub fn bridge_ref(&self, source_ref: String) -> Option<U128> {
        self.bridge_refs.get(&source_ref).map(|v| U128(*v))
    }

    pub fn set_minter(&mut self, minter_id: AccountId) {
        require!(env::predecessor_account_id() == self.owner_id, "ERR_NOT_OWNER");
        self.minter_id = minter_id;
    }

    fn ensure_registered(&mut self, account_id: &AccountId) {
        if self.token.storage_balance_of(account_id.clone()).is_none() {
            let min = self.token.storage_balance_bounds().min;
            require!(env::attached_deposit() >= min, "ERR_ATTACH_STORAGE_DEPOSIT");
            self.token.internal_register_account(account_id);
        }
    }
}

// ---- NEP-141 / NEP-145 / NEP-148 plumbing ----

#[near]
impl FungibleTokenCore for QusdToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for QusdToken {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for QusdToken {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for QusdToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Quire Test USD (testnet only, no value)".to_string(),
            symbol: "qUSD".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(p: AccountId, deposit: NearToken, ts: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(p).attached_deposit(deposit).block_timestamp(ts);
        testing_env!(b.build());
    }

    #[test]
    fn faucet_and_cooldown() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 0);
        let mut t = QusdToken::new(accounts(0), accounts(0));
        ctx(accounts(1), NearToken::from_millinear(10), 0);
        assert_eq!(t.faucet().0, FAUCET_AMOUNT);
        assert_eq!(t.ft_balance_of(accounts(1)).0, FAUCET_AMOUNT);
        ctx(accounts(1), NearToken::from_yoctonear(0), FAUCET_COOLDOWN_NS);
        t.faucet();
        assert_eq!(t.ft_balance_of(accounts(1)).0, 2 * FAUCET_AMOUNT);
    }

    #[test]
    #[should_panic(expected = "ERR_FAUCET_COOLDOWN")]
    fn faucet_rate_limited() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 0);
        let mut t = QusdToken::new(accounts(0), accounts(0));
        ctx(accounts(1), NearToken::from_millinear(10), 0);
        t.faucet();
        ctx(accounts(1), NearToken::from_yoctonear(0), 10);
        t.faucet();
    }

    #[test]
    #[should_panic(expected = "ERR_REF_USED")]
    fn bridge_ref_is_single_use() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 0);
        let mut t = QusdToken::new(accounts(0), accounts(5));
        ctx(accounts(5), NearToken::from_millinear(10), 0);
        t.bridge_mint(accounts(1), U128(10), "intents:abc".into());
        t.bridge_mint(accounts(1), U128(10), "intents:abc".into());
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_MINTER")]
    fn only_minter_bridges() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 0);
        let mut t = QusdToken::new(accounts(0), accounts(5));
        ctx(accounts(1), NearToken::from_millinear(10), 0);
        t.bridge_mint(accounts(1), U128(10), "x".into());
    }
}
