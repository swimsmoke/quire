"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clientRequest } from "./api";

interface Me {
  session: { accountId: string; method: "NEP413" | "DEV_SIM" };
  balances: { traderAccount: string; executionMode: string; available: string }[];
}

interface SessionCtx {
  token: string | null;
  me: Me | null;
  ready: boolean;
  balance: string; // available NEAR (base units) in the active execution mode
  signInSimulated: (handle: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  claimTestFunds: () => Promise<string>;
}

const Ctx = createContext<SessionCtx | null>(null);
const KEY = "quire.session";

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (t: string | null) => {
    if (!t) {
      setMe(null);
      return;
    }
    try {
      setMe(await clientRequest<Me>("/me", { token: t }));
    } catch {
      writeToken(null);
      setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const t = readToken();
    setToken(t);
    load(t).finally(() => setReady(true));
  }, [load]);

  const value = useMemo<SessionCtx>(
    () => ({
      token,
      me,
      ready,
      balance: me?.balances.find((b) => b.executionMode === "SIMULATED")?.available ?? "0",
      async signInSimulated(handle) {
        const r = await clientRequest<{ token: string }>("/auth/dev-login", { method: "POST", body: { handle } });
        writeToken(r.token);
        setToken(r.token);
        await load(r.token);
      },
      signOut() {
        writeToken(null);
        setToken(null);
        setMe(null);
      },
      refresh: () => load(token),
      async claimTestFunds() {
        const r = await clientRequest<{ credited: string }>("/faucet", { method: "POST", token });
        await load(token);
        return r.credited;
      },
    }),
    [token, me, ready, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}
