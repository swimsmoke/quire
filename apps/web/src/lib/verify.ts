import { recoverMessageAddress } from "viem";

export interface SignedInference {
  model: string;
  requestHash: string | null;
  responseHash: string | null;
  signatureText: string | null;
  signature: string | null;
  signingAddress: string | null;
}

/** Re-check an enclave signature in this browser: hashes match, and the signature recovers to the signer. */
export async function checkSignature(i: SignedInference): Promise<{ ok: boolean; text: string }> {
  if (!i.signatureText || !i.signature || !i.signingAddress) return { ok: false, text: "No signature was recorded for this answer." };
  const parts = i.signatureText.split(":");
  const resp = parts.pop();
  const req = parts.pop();
  if (req !== i.requestHash || resp !== i.responseHash) return { ok: false, text: "The signed hashes differ from the ones Quire recorded." };
  try {
    const who = await recoverMessageAddress({ message: i.signatureText, signature: i.signature as `0x${string}` });
    if (who.toLowerCase() !== i.signingAddress.toLowerCase()) return { ok: false, text: `The signature recovers to ${who}, not the stated signer.` };
    return { ok: true, text: `Checked in your browser: signed by ${i.signingAddress.slice(0, 10)}…${i.signingAddress.slice(-6)} over the recorded request and response hashes.` };
  } catch {
    return { ok: false, text: "The signature could not be parsed." };
  }
}
