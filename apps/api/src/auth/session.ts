import { jwtVerify, SignJWT } from "jose";
import type { FastifyRequest } from "fastify";

export interface Session {
  userId: string;
  accountId: string; // NEAR account id (or *.sim in simulated dev auth)
  method: "NEP413" | "DEV_SIM";
}

export function sessionCodec(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(s: Session, ttlSeconds = 60 * 60 * 24 * 7) {
      return new SignJWT({ acc: s.accountId, m: s.method })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(s.userId)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .setIssuer("quire")
        .sign(key);
    },
    async verify(token: string): Promise<Session | null> {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: "quire", algorithms: ["HS256"] });
        if (typeof payload.sub !== "string" || typeof payload.acc !== "string") return null;
        const m = payload.m === "NEP413" ? "NEP413" : "DEV_SIM";
        return { userId: payload.sub, accountId: payload.acc, method: m };
      } catch {
        return null;
      }
    },
  };
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}
