#!/usr/bin/env python3
"""Derive a deterministic NEAR ed25519 key pair for the testnet contract account.

The deploy workflow uses this so you never export a key from a wallet:
seed = sha256("quire-deploy-v1|<account_id>|<passphrase>"). The same passphrase and
account always give the same key, so re-runs (upgrades) keep working.

Usage: derive_key.py <account_id>          (reads the passphrase from $QUIRE_DEPLOY_SEED)
Prints two lines: the public key, then the private key (ed25519:<base58>).
Testnet only: anyone who knows the passphrase controls the contract account.
"""
import hashlib
import os
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    pad = len(data) - len(data.lstrip(b"\0"))
    return "1" * pad + out


def derive(account_id: str, passphrase: str) -> tuple[str, str]:
    if len(passphrase) < 16:
        raise SystemExit("QUIRE_DEPLOY_SEED must be at least 16 characters")
    seed = hashlib.sha256(f"quire-deploy-v1|{account_id}|{passphrase}".encode()).digest()
    pub = Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return f"ed25519:{b58encode(pub)}", f"ed25519:{b58encode(seed + pub)}"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    phrase = os.environ.get("QUIRE_DEPLOY_SEED", "")
    public, private = derive(sys.argv[1], phrase)
    print(public)
    print(private)
