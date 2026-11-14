/**
 * Sends the jury's ruling to the market contract from the jury account.
 * The jury account is the contract's resolver and holds no other power:
 * it cannot trade for anyone, move funds, or change the contract.
 */
import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";

export interface JuryAccount {
  accountId: string;
  privateKey: string;
  rpcUrl: string;
  contractId: string;
}

export async function proposeOnChain(j: JuryAccount, onchainId: number, resolution: "YES" | "NO" | "INVALID", evidenceUri: string): Promise<string> {
  const provider = new JsonRpcProvider({ url: j.rpcUrl });
  const account = new Account(j.accountId, provider, j.privateKey as KeyPairString);
  const res = await account.callFunctionRaw({
    contractId: j.contractId,
    methodName: "propose_resolution",
    args: { market_id: onchainId, resolution, evidence_uri: evidenceUri.slice(0, 300) },
    gas: 30_000_000_000_000n,
    waitUntil: "EXECUTED_OPTIMISTIC",
  });
  const status = res.status as unknown as Record<string, unknown> | string | undefined;
  if (status && typeof status === "object" && "Failure" in status) throw new Error(`propose_resolution failed: ${JSON.stringify(status.Failure).slice(0, 300)}`);
  const hash = (res as unknown as { transaction?: { hash?: string } }).transaction?.hash;
  if (!hash) throw new Error("no transaction hash in the RPC response");
  return hash;
}
