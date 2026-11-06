//! Integer FPMM math. Bit-for-bit mirror of packages/shared/src/fpmm.ts.
//! Verified against tests/vectors.json generated from the TypeScript reference.

pub const PRICE_SCALE: u128 = 1_000_000;
pub const BPS: u128 = 10_000;
pub const MIN_PROB_PPM: u128 = 10_000;
pub const MAX_PROB_PPM: u128 = 990_000;
pub const MAX_RESERVE: u128 = 1_000_000_000_000_000; // 1e15
pub const MAX_TRADE: u128 = 100_000_000_000_000; // 1e14
pub const MAX_FEE_BPS: u128 = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FpmmError {
    ZeroAmount,
    AmountTooLarge,
    EmptyPool,
    ReserveCap,
    InsufficientOutput,
    BadProbability,
    BadFee,
    Invariant,
}

impl FpmmError {
    pub fn code(&self) -> &'static str {
        match self {
            FpmmError::ZeroAmount => "ERR_ZERO_AMOUNT",
            FpmmError::AmountTooLarge => "ERR_AMOUNT_TOO_LARGE",
            FpmmError::EmptyPool => "ERR_EMPTY_POOL",
            FpmmError::ReserveCap => "ERR_RESERVE_CAP",
            FpmmError::InsufficientOutput => "ERR_INSUFFICIENT_OUTPUT",
            FpmmError::BadProbability => "ERR_BAD_PROBABILITY",
            FpmmError::BadFee => "ERR_BAD_FEE",
            FpmmError::Invariant => "ERR_INVARIANT",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pool {
    pub yes: u128,
    pub no: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Yes,
    No,
}

#[inline]
fn ceil_div(a: u128, b: u128) -> u128 {
    (a + b - 1) / b
}

pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

pub fn isqrt_ceil(n: u128) -> u128 {
    let r = isqrt(n);
    if r * r == n {
        r
    } else {
        r + 1
    }
}

fn check_pool(p: &Pool) -> Result<(), FpmmError> {
    if p.yes == 0 || p.no == 0 {
        return Err(FpmmError::EmptyPool);
    }
    Ok(())
}

fn check_fee(fee_bps: u128) -> Result<(), FpmmError> {
    if fee_bps > MAX_FEE_BPS {
        return Err(FpmmError::BadFee);
    }
    Ok(())
}

pub fn price_yes(p: &Pool) -> u128 {
    p.no * PRICE_SCALE / (p.yes + p.no)
}

pub fn price_of(p: &Pool, side: Side) -> u128 {
    match side {
        Side::Yes => price_yes(p),
        Side::No => PRICE_SCALE - price_yes(p),
    }
}

pub fn fee_for(amount: u128, fee_bps: u128) -> u128 {
    ceil_div(amount * fee_bps, BPS)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyResult {
    pub fee: u128,
    pub shares_out: u128,
    pub pool_after: Pool,
}

pub fn quote_buy(pool: &Pool, side: Side, collateral_in: u128, fee_bps: u128) -> Result<BuyResult, FpmmError> {
    check_pool(pool)?;
    if collateral_in == 0 {
        return Err(FpmmError::ZeroAmount);
    }
    if collateral_in > MAX_TRADE {
        return Err(FpmmError::AmountTooLarge);
    }
    check_fee(fee_bps)?;
    let fee = fee_for(collateral_in, fee_bps);
    if collateral_in <= fee {
        return Err(FpmmError::ZeroAmount);
    }
    let net = collateral_in - fee;
    let (same, other) = match side {
        Side::Yes => (pool.yes, pool.no),
        Side::No => (pool.no, pool.yes),
    };
    let new_other = other + net;
    let new_same = ceil_div(same * other, new_other);
    let shares_out = (same + net).checked_sub(new_same).unwrap_or(0);
    if shares_out == 0 {
        return Err(FpmmError::InsufficientOutput);
    }
    if new_other > MAX_RESERVE || new_same > MAX_RESERVE {
        return Err(FpmmError::ReserveCap);
    }
    let pool_after = match side {
        Side::Yes => Pool { yes: new_same, no: new_other },
        Side::No => Pool { yes: new_other, no: new_same },
    };
    if pool_after.yes * pool_after.no < pool.yes * pool.no {
        return Err(FpmmError::Invariant);
    }
    Ok(BuyResult { fee, shares_out, pool_after })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellResult {
    pub gross: u128,
    pub fee: u128,
    pub collateral_out: u128,
    pub pool_after: Pool,
}

pub fn quote_sell(pool: &Pool, side: Side, shares_in: u128, fee_bps: u128) -> Result<SellResult, FpmmError> {
    check_pool(pool)?;
    check_fee(fee_bps)?;
    if shares_in == 0 {
        return Err(FpmmError::ZeroAmount);
    }
    if shares_in > MAX_TRADE {
        return Err(FpmmError::AmountTooLarge);
    }
    let (same, other) = match side {
        Side::Yes => (pool.yes, pool.no),
        Side::No => (pool.no, pool.yes),
    };
    let k = same * other;
    let b = same + shares_in + other;
    let disc = b * b - 4 * shares_in * other;
    let mut x = (b - isqrt_ceil(disc)) / 2;
    while x > 0 && (other <= x || (same + shares_in - x) * (other - x) < k) {
        x -= 1;
    }
    if x == 0 {
        return Err(FpmmError::InsufficientOutput);
    }
    let fee = fee_for(x, fee_bps);
    if x <= fee {
        return Err(FpmmError::InsufficientOutput);
    }
    let collateral_out = x - fee;
    let new_same = same + shares_in - x;
    let new_other = other - x;
    if new_same > MAX_RESERVE {
        return Err(FpmmError::ReserveCap);
    }
    let pool_after = match side {
        Side::Yes => Pool { yes: new_same, no: new_other },
        Side::No => Pool { yes: new_other, no: new_same },
    };
    Ok(SellResult { gross: x, fee, collateral_out, pool_after })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeedResult {
    pub pool: Pool,
    pub lp_yes: u128,
    pub lp_no: u128,
}

pub fn seed_pool(liquidity: u128, prob_ppm: u128) -> Result<SeedResult, FpmmError> {
    if liquidity == 0 {
        return Err(FpmmError::ZeroAmount);
    }
    if liquidity > MAX_RESERVE {
        return Err(FpmmError::ReserveCap);
    }
    if !(MIN_PROB_PPM..=MAX_PROB_PPM).contains(&prob_ppm) {
        return Err(FpmmError::BadProbability);
    }
    if prob_ppm >= PRICE_SCALE / 2 {
        let yes = liquidity * (PRICE_SCALE - prob_ppm) / prob_ppm;
        Ok(SeedResult { pool: Pool { yes, no: liquidity }, lp_yes: liquidity - yes, lp_no: 0 })
    } else {
        let no = liquidity * prob_ppm / (PRICE_SCALE - prob_ppm);
        Ok(SeedResult { pool: Pool { yes: liquidity, no }, lp_yes: 0, lp_no: liquidity - no })
    }
}
