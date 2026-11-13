"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clientRequest } from "./api";

export interface ChainInfo {
  mode: "SIMULATED" | "ONCHAIN_TESTNET" | "ONCHAIN_MAINNET";
  contractId: string | null;
  network: "testnet" | "mainnet";
}

interface Me {
  session: { accountId: string; method: "NEP413" | "DEV_SIM" | "NEAR_WALLET" };
  balances: { traderAccount: string; executionMode: string; available: string }[];
}

interface SessionCtx {
  chain: ChainInfo;
  onchain: boolean;
  token: string | null;
  me: Me | null;
  ready: boolean;
  /** Trading balance in base units (micro-NEAR): simulated ledger, or the contract balance on-chain. */
  balance: string;
  /** On-chain only: whether this account has deposited before. */
  registered: boolean;
  signInSimulated: (handle: string) => Promise<void>;
  connectWallet: () => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  claimTestFunds: () => Promise<string>;
  /** Sign and send a contract call with the connected wallet. Returns the transaction hash. */
  callContract: (method: string, args: object, opts?: { depositYocto?: string; gasTgas?: number }) => Promise<string>;
  /** Read-only contract call straight from NEAR RPC. */
  viewContract: <T>(method: string, args: object) => Promise<T>;
}

const Ctx = createContext<SessionCtx | null>(null);
const KEY = "quire.session";
const RPC = { testnet: "https://test.rpc.fastnear.com", mainnet: "https://rpc.mainnet.fastnear.com" };

function readToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function writeToken(t: string | null) {
  try {
    if (t) window.localStorage.setItem(KEY, t);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session lasts for this tab only */
  }
}

type Connector = import("@hot-labs/near-connect").NearConnector;

export function SessionProvider({ chain, children }: { chain: ChainInfo; children: ReactNode }) {
  const onchain = chain.mode !== "SIMULATED" && !!chain.contractId;
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [chainBalance, setChainBalance] = useState("0");
  const [registered, setRegistered] = useState(false);
  const connector = useRef<Connector | null>(null);

  const viewContract = useCallback(
    async <T,>(method: string, args: object): Promise<T> => {
      const r = await fetch(RPC[chain.network], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "quire",
          method: "query",
          params: { request_type: "call_function", finality: "optimistic", account_id: chain.contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) },
        }),
      });
      const j = await r.json();
      if (j.error || !j.result?.result) throw new Error(j.error?.cause?.name ?? j.result?.error ?? "Couldn't read from NEAR");
      return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result))) as T;
    },
    [chain.network, chain.contractId],
  );

  const loadChainAccount = useCallback(
    async (accountId: string | null) => {
      if (!accountId) {
        setMe(null);
        setChainBalance("0");
        setRegistered(false);
        return;
      }
      setMe({ session: { accountId, method: "NEAR_WALLET" }, balances: [] });
      try {
        const acc = await viewContract<{ balance: string } | null>("get_account", { account_id: accountId });
        setChainBalance(acc?.balance ?? "0");
        setRegistered(!!acc);
      } catch {
        /* keep the last known balance if the RPC read fails */
      }
    },
    [viewContract],
  );

  const loadSim = useCallback(async (t: string | null) => {
    if (!t) return setMe(null);
    try {
      setMe(await clientRequest<Me>("/me", { token: t }));
    } catch {
      writeToken(null);
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (onchain) {
        try {
          const { NearConnector } = await import("@hot-labs/near-connect");
          const c = new NearConnector({ network: chain.network, autoConnect: true });
          connector.current = c;
          c.on("wallet:signIn", (e) => !cancelled && loadChainAccount(e.accounts[0]?.accountId ?? null));
          c.on("wallet:signOut", () => !cancelled && loadChainAccount(null));
          const cur = await c.getConnectedWallet();
          if (!cancelled) await loadChainAccount(cur.accounts[0]?.accountId ?? null);
        } catch {
          /* no wallet connected yet */
        }
      } else {
        const t = readToken();
        setToken(t);
        await loadSim(t);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [onchain, chain.network, loadChainAccount, loadSim]);

  const value = useMemo<SessionCtx>(
    () => ({
      chain,
      onchain,
      token,
      me,
      ready,
      balance: onchain ? chainBalance : (me?.balances.find((b) => b.executionMode === "SIMULATED")?.available ?? "0"),
      registered,
      async signInSimulated(handle) {
        const r = await clientRequest<{ token: string }>("/auth/dev-login", { method: "POST", body: { handle } });
        writeToken(r.token);
        setToken(r.token);
        await loadSim(r.token);
      },
      async connectWallet() {
        if (!connector.current) throw new Error("Wallet connection is still loading. Try again in a moment.");
        const wallet = await connector.current.connect();
        const accounts = await wallet.getAccounts();
        await loadChainAccount(accounts[0]?.accountId ?? null);
      },
      signOut() {
        if (onchain) {
          connector.current?.disconnect().catch(() => undefined);
          loadChainAccount(null);
        } else {
          writeToken(null);
          setToken(null);
          setMe(null);
        }
      },
      refresh: () => (onchain ? loadChainAccount(me?.session.accountId ?? null) : loadSim(token)),
      async claimTestFunds() {
        const r = await clientRequest<{ credited: string }>("/faucet", { method: "POST", token });
        await loadSim(token);
        return r.credited;
      },
      async callContract(method, args, opts = {}) {
        if (!connector.current || !me || !chain.contractId) throw new Error("Connect your wallet first.");
        const wallet = await connector.current.wallet();
        let outcome: unknown;
        try {
          outcome = await wallet.signAndSendTransaction({
            signerId: me.session.accountId,
            receiverId: chain.contractId,
            actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: String(BigInt(opts.gasTgas ?? 60) * 10n ** 12n), deposit: opts.depositYocto ?? "0" } }],
          });
        } catch (e) {
          throw new Error(chainError(e));
        }
        const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string }; status?: { Failure?: unknown } };
        if (o.status && typeof o.status === "object" && "Failure" in o.status) throw new Error(chainError(o.status.Failure));
        const hash = o.transaction?.hash ?? o.transaction_outcome?.id;
        if (!hash) throw new Error("The wallet didn't return a transaction hash.");
        return hash;
      },
      viewContract,
    }),
    [chain, onchain, token, me, ready, chainBalance, registered, loadSim, loadChainAccount, viewContract],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const CHAIN_ERRORS: Record<string, string> = {
  ERR_SLIPPAGE: "The price moved past your slippage limit. Get a new quote and try again.",
  ERR_INSUFFICIENT_BALANCE: "Your Quire balance is too low. Deposit NEAR first.",
  ERR_INSUFFICIENT_SHARES: "You don't hold that many shares in this outcome.",
  ERR_NOT_REGISTERED: "Deposit NEAR into Quire first.",
  ERR_ACCOUNT_CAP: "That deposit would exceed the per-account safety cap.",
  ERR_TVL_CAP: "Quire's total safety cap has been reached, so deposits are closed for now.",
  ERR_DEPOSIT_TOO_SMALL: "The first deposit must be larger than the 0.003 NEAR registration cost.",
  ERR_MARKET_NOT_ACTIVE: "Trading is paused on this market.",
  ERR_PAUSED: "Trading is paused.",
  ERR_NOT_OWNER: "Only the contract owner can do that.",
  ERR_LIQUIDITY_TOO_LOW: "A new market needs at least 0.1 NEAR of liquidity.",
  ERR_NOT_CREATOR: "Only the person who created this market can do that.",
  ERR_BAD_SLUG: "The market's web address is too long. Shorten the question.",
  ERR_DUPLICATE_ORDER: "This order was already submitted.",
};

/** Turn a contract panic or wallet error into a plain sentence. */
export function chainError(e: unknown): string {
  const text = typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e ?? "");
  const code = /ERR_[A-Z_]+/.exec(text)?.[0];
  if (code && CHAIN_ERRORS[code]) return CHAIN_ERRORS[code];
  if (/reject|cancel|denied|closed/i.test(text)) return "You cancelled the request in your wallet.";
  return code ?? (text.length > 160 || !text ? "The transaction failed on NEAR." : text);
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}
